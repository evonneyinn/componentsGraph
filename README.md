# Vue Analyser

This tool uses static analysis to determine component relationships in a Vue project.

## Installation and Dependencies

1. This project relies on `npm` and `nodejs`. Please install the relevant version for your operationg system.

2. In order to generate graphics, this project uses `Graphviz` and `dot`. Please follow the relevant instructions for your operating system found [here](https://graphviz.org/download/). On Ubuntu, this is done by running 
```
sudo apt-get install graphviz
```

3. If you would like to generate a GIF for your project, please ensure that you have `imagemagick` installed. On Ubuntu, this is done by running 
```
sudo apt-get install imagemagick
```
4. To install `npm` dependencies, run
```
npm install
```
## Running and Command Line Options

The following command line options are available
```
--hide     hides alist of labels. Default=[]  
--hide-all hides all labels.      Default=false
--gif      produces a GIF.        Default=false
```

To run the analyser, use
```
node analyser.js [options] {directory to analyse}
```