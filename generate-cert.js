const selfsigned = require('selfsigned');
const fs = require('fs');

console.log('Generating self-signed SSL certificate...');

const attrs = [
  { name: 'commonName', value: 'localhost' },
  { name: 'countryName', value: 'US' },
  { shortName: 'ST', value: 'CA' },
  { name: 'localityName', value: 'San Francisco' },
  { name: 'organizationName', value: 'Prof Network' },
  { shortName: 'OU', value: 'Dev' }
];

const options = {
  keySize: 2048,
  days: 365,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'subjectAltName',
      altNames: [
        { type: 2, value: 'localhost' },
        { type: 2, value: '127.0.0.1' },
        { type: 7, ip: '127.0.0.1' }
      ]
    }
  ]
};

try {
  const pems = selfsigned.generate(attrs, options);
  
  fs.writeFileSync('cert.pem', pems.cert);
  fs.writeFileSync('privkey.pem', pems.private);
  
  console.log('✅ SSL certificates generated successfully!');
  console.log('📝 Files created:');
  console.log('   - cert.pem (certificate)');
  console.log('   - privkey.pem (private key)');
  console.log('🔒 Your HTTPS server can now use these certificates');
  
} catch (error) {
  console.error('❌ Error generating certificates:', error.message);
}
