const http = require('http')
const fs = require('fs')
const util = require('util')
const { exit } = require('process')
const { deepStrictEqual } = require('assert')
const port = 3000

const args = process.argv
if (args.length < 3) {
    console.error('No file path specified')
    exit(1)
}

const path = args[2]
var trees = []
const subComponents = new Set()
analyse(path).then(data => {
    outputGraph()
})

function outputGraph () {
    var content = ''
    content += 'digraph { \n'
    trees.forEach((tree) => {
        var queue = []
        queue.push(tree)
        while (queue.length !== 0) {
            var current = queue.pop(0)
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
    var split =  path.split('/')
    var fileName =split[split.length-1] + '.gviz'
    fs.writeFile(fileName, content, function (err, data) {
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


