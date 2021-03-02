const http = require('http')
const fs = require('fs')
const util = require('util')
const { exit, stderr, mainModule, stdout } = require('process')
const exec = require('await-exec')
const yargs = require('yargs');
const sizeOf = require('image-size')

// parse argument
const argv = yargs
    .option('hide', {
        alias: 'hide',
        description: 'Hide selected labels',
        type: 'array',
        default: []
    })
    .option('hide-all', {
        alias: 'hideAll',
        description: 'Hide all labels',
        type: 'boolean',
        default: false
    })
    .option('gif', {
        alias: 'gif',
        description: 'Produce gif',
        type: 'boolean',
        default: false
    })
    .argv

const args = process.argv
if (argv._ < 1) {
    console.error('No file path specified')
    exit(1)
}

const path = argv._[0]
const hiddenLabels = argv.hide
const hideAll = argv.hideAll
const gif = argv.gif
var split = path.split('/')
var fileName = split[split.length-1]
var trees = []
const subComponents = new Set()
var componentList = []
var isGitRepo = true
var hashes = []

main()

async function main() {
    //Check for Git repo
    try {
        let {stdout, stderr} = await exec('cd ' + path + ' && git log')
        //Extract commits
        hashes = extractCommitsFromLog(stdout)
    } catch (error) {
        if (error.toString().includes('not a git repository')) {
            console.log('Not a Git repository. Analysing only current project state.')
            isGitRepo = false
        }
    }

    if (isGitRepo) {
        var gifString = ''
        var maxHeight = 0
        var maxWidth = 0
        for (const hash of hashes) {
            trees = []
            componentList = []
            //Checkout commit
            try {
                await exec('cd ' + path + ' && git checkout ' + hash)
            } catch (error) {
                console.log('Could not analyse commit: ' + hash)
                continue
            }

            await analyse(path)

            if (trees.length === 0) {
                console.log('Did not find any Vue files for commit: ' + hash)
                return
            }

            var i = hashes.indexOf(hash).toString()
            sortAndFilterComponents()
            outputGraph(i)
            await exec('dot -Tpng ' + fileName + i + '.gviz > ' + fileName + i + '.png')
            gifString += fileName + i + '.png '
            try {
                var dimensions = sizeOf(fileName + i + '.png')
                if (dimensions.height > maxHeight) {
                    maxHeight = dimensions.height
                }
                if (dimensions.width > maxWidth) {
                    maxWidth = dimensions.width
                }
            } catch (error) {
            }
        }
        if (gif) {
            try {
                await exec('convert -size ' + maxWidth + 'x' + maxHeight + ' canvas: white.png') //TODO dynamic size
                var endIndex = hashes.length -1
                await exec('convert -coalesce -delay 100 -loop 0 white.png ' + gifString + ' -deconstruct '+ fileName + '.gif') 
            } catch (error) {
                console.log("Error creating Gif. Try running it again")
            } 
        }
    } else {
        await analyse(path)

        if (trees.length === 0) {
            console.log('Did not find any Vue files. Quitting...')
            exit(0)
        }

        sortAndFilterComponents()
        outputGraph(null)

        await exec('dot -Tpng ' + fileName + '.gviz > ' + fileName + '.png')
    }
}

function sortAndFilterComponents () {
    // Sort the components by lines of code
    componentList.sort((a, b) => {
        if (a.linesOfCode > b.linesOfCode) {
            return 1
        } else if (a.linesOfCode < b.linesOfCode) {
            return -1
        }
        return 0
    })

    // Filter duplicates
    var length = componentList.length
    var i = 0
    while (i < length -1) {
        if (componentList[i].name === componentList[i+1].name) {
            componentList.splice(i+1, 1)
            length -= 1
        } else {
            i++
        }
    }
}

function extractCommitsFromLog (log) {
    var lines = log.split('\n')
    var hashes = []
    lines.forEach ((line) => { 
        if (line.startsWith('commit')) {
            var hash = line.split(' ')[1]
            hashes.push(hash)
        }
    })
    hashes.reverse()
    return hashes
}

function outputGraph (i) {
    var topIndex = Math.ceil(componentList.length*0.95)-1
    var topPercentile = componentList.slice(topIndex)
    var topPercentileSet = new Set()
    topPercentile.forEach((val)=>{
        topPercentileSet.add(val.name)
    })
    var content = ''
    content += 'digraph { \n'
    content += '  node [shape = circle];\n'
    trees.forEach((tree) => {
        var queue = []
        queue.push(tree) 
        content += '  ' + tree.name + ' [ peripheries=2 ];\n'
        while (queue.length !== 0) {
            var current = queue.pop(0)
            var color = ''
            if (topPercentileSet.has(current.name)) {
                color = 'style=filled , fillcolor="#F06F86"'
            }
            var size = 2.5 + current.linesOfCode/80
            content += '  ' + current.name + '[fixedsize=true, width=' + size + '];\n'
            if (hideAll || hiddenLabels.includes(current.name)) {
                content += '  ' + current.name + ' [ label="***\n' + current.linesOfCode + '" , ' + color + ' ];\n'
            } else {
                content += '  ' + current.name + ' [ label="' + current.name + '\n' + current.linesOfCode + '" , ' + color + ' ];\n'
            }
            
            if (current.children.length === 0) {
                var line = '  ' + current.name  + ' ;\n'
                content += line
            }
            current.children.forEach ((child) => {
                var line = '  ' + current.name + ' -> ' + child.name
                if (child.isLoopStart) {
                    line = line + ' [ style="dashed" ]'
                }
                line += " ;\n"
                content += line
                queue.push(child)
            }) 
        }
    })
    content += '}\n'
    var file = ''
    if (isGitRepo) {
        file = fileName + i + '.gviz'
    } else {
        file = fileName + '.gviz'
    }
    
    fs.writeFile(file, content, function (err, data) {
        if (err) {
            console.log('Could not write graph to file')
        }
    })
}

function buildNode (path, seen) {
    var content;
    try {
        content = fs.readFileSync(path, 'utf8')
    } catch (error) {
        console.error('Could not read '+ path)
        exit(1)
    }
    var importMap = {}
    var compStr = ""
    var components = []
    var readComponents = false
    content.split('\n').forEach((line) => {
        if (line.startsWith('import')) {
            // map components to path
            line = line.replace('import', '')
            line = line.replace(/\'/g, '')
            var parts = line.split('from')
            var name = parts[0].trim()
            var path = parts[1].trim().replace(';', '')
            importMap[name] = path
        } else if (line.includes('components:')) {
            readComponents = true
        }
        // extracts components
        if (readComponents) {
            compStr += line
        }

        if (readComponents && line.includes('}')) {
            readComponents = false
        }
    })

    compStr = compStr.replace('components:', '')
    compStr = compStr.replace('{', '')
    compStr = compStr.replace('}', '')
    compStr = compStr.replace(/\s/g, '')
    components = compStr.split(',')
    components = components.filter((comp) => {
        return comp.length !== 0
    })
    const indexOfSlash = path.lastIndexOf('/')+1
    const dirpath = path.slice(0, indexOfSlash)
    const fileName = path.slice(indexOfSlash).replace('.vue', '')
    /* check if in the loop before looking for children */
    var hasSeen = seen.has(fileName)
    var children = []
    if (!hasSeen) {
        seen.add(fileName)
        components.forEach((component) => {
            var child = buildNode(dirpath + importMap[component], seen)
            children.push(child)
            subComponents.add(child.name)
        })
    }
    seen.delete(fileName)
    componentList.push({'name':fileName, 'linesOfCode':content.split('\n').length})
    return {
        'name': fileName,
        'children': children,
        'linesOfCode': content.split('\n').length,
        'isLoopStart': hasSeen
    }
}

async function analyse (path) {
    var dir
    try {
        dir = await fs.promises.opendir(path)
    } catch (error) {
        console.error('Could not open directory: ' + path)
        exit(1)
    }

    for await (const dirent of dir) {
        if (dirent.isDirectory() && dirent.name != 'node_modules'  && dirent.name != '.git') {
            var newPath = dir.path 
            if (newPath.substr(-1) === '/') {
                newPath = newPath + dirent.name
            } else {
                newPath = newPath + '/' + dirent.name
            }
            await analyse(newPath)
        } else if (dirent.isFile() && dirent.name.endsWith('.vue')) {
            var newPath = dir.path 
            if (newPath.substr(-1) === '/') {
                newPath = newPath + dirent.name
            } else {
                newPath = newPath + '/' + dirent.name
            }
            var tree = buildNode(newPath, new Set())
            trees.push(tree)
        }
    }
    subComponents.forEach((comp) => {
        trees = trees.filter((tree) => {
            return comp !== tree.name
        })
    })

}


