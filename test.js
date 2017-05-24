const shelljs = require('shelljs');

const files = shelljs.ls('-l', '.');
console.log(files);
