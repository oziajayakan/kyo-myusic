const sharp = require('sharp');
const fs = require('fs');

async function main() {
  try {
    await sharp('assets/kyo_logo.jpg').resize(256, 256).toFile('www/kyo_icon.png');
    await sharp('assets/kyo_logo.jpg').resize(256, 256).toFile('www/kyo_icon.webp');
    await sharp('assets/kyo_logo.jpg').resize(256, 256).toFile('www/nimiyo_icon.webp');
    console.log('Successfully generated icons!');
  } catch (err) {
    console.error('Error generating icon:', err);
  }
}

main();
