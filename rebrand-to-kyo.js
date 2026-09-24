const fs = require('fs');
const path = require('path');

const targetFiles = [
  'src/index.html',
  'src/app.js',
  'src/share.html',
  'src/share.js',
  'electron/main.js',
  'make-installer.js',
  'version.json'
];

targetFiles.forEach(file => {
  const fullPath = path.resolve(__dirname, file);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Replace all occurrences of NIMIYO, Nimiyo, nimiyo
    content = content.replace(/NIMIYO/g, 'KYO');
    content = content.replace(/Nimiyo/g, 'KYO');
    content = content.replace(/nimiyo/g, 'kyo');
    
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log(`Rebranded: ${file}`);
  }
});

console.log('All targeted files rebranded to KYO successfully!');
