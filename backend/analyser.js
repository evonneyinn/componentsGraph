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
    console.log(trees)
    const server = http.createServer(function (req, res) {
        res.writeHead(200, {'Content-type': 'text/html'})
        fs.readFile('index.html', function(error, data) {
            if (error) {
                res.writeHead(404)
                res.write('Error: File not found')
            } else {
                res.write(data)
            }
            res.end()
        })
    })
    
    server.listen(port, function(error) {
        if (error) {
            console.log('Something went wrong', error)
        } else {
            console.log('Server is listening on port' + port)
        }
    })
})

function buildNode (path) {
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

    var children = []
    components.forEach((component) => {
        var child = buildNode(dirpath + importMap[component])
        children.push(child)
        subComponents.add(child.name)
    })


    return {
        'name': fileName,
        'children': children
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
            var tree = buildNode(newPath)
            trees.push(tree)
        }
    }
    subComponents.forEach((comp) => {
        trees = trees.filter((tree) => {
            return comp !== tree.name
        })
    })

}


