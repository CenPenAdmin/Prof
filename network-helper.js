const fs = require('fs');
const https = require('https');

console.log('🌐 Prof HTTPS Server - Network Configuration Helper');
console.log('====================================================');

// Get current public IP
function getCurrentPublicIP() {
  return new Promise((resolve, reject) => {
    https.get('https://ifconfig.me/ip', (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data.trim()));
    }).on('error', reject);
  });
}

// Check if server is accessible
function checkServerAccess(ip) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: ip,
      port: 443,
      path: '/api/test',
      method: 'GET',
      rejectUnauthorized: false // Allow self-signed certificates
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve(response);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  try {
    console.log('📍 Getting current public IP...');
    const publicIP = await getCurrentPublicIP();
    console.log(`   Public IP: ${publicIP}`);
    
    console.log('\n🏠 Local server info:');
    console.log(`   Local IP: 192.168.88.4`);
    console.log(`   HTTPS URL: https://localhost:443`);
    
    console.log('\n🌍 External access URLs:');
    console.log(`   https://${publicIP}:443`);
    console.log(`   https://${publicIP}/api/test (test endpoint)`);
    
    console.log('\n📋 Next steps:');
    console.log('1. Configure Windows Firewall (run as admin):');
    console.log('   netsh advfirewall firewall add rule name="HTTPS Server" dir=in action=allow protocol=TCP localport=443');
    
    console.log('\n2. Configure router port forwarding:');
    console.log(`   Router admin: http://192.168.88.1`);
    console.log(`   Forward external port 443 to internal IP 192.168.88.4:443`);
    
    console.log('\n3. Test external access:');
    console.log(`   https://${publicIP}/api/test`);
    
    console.log('\n🔄 For Pi Browser integration:');
    console.log(`   Register this URL: https://${publicIP}`);
    
    // Save configuration
    const config = {
      publicIP,
      localIP: '192.168.88.4',
      httpsPort: 443,
      routerIP: '192.168.88.1',
      lastUpdated: new Date().toISOString()
    };
    
    fs.writeFileSync('network-config.json', JSON.stringify(config, null, 2));
    console.log('\n💾 Configuration saved to network-config.json');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

main();
