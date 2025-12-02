const chalk = require('chalk');
const path = require('path');
const { spawn } = require('child_process');

async function serverCommand(options) {
  const port = options.port || 3000;
  const dataDir = options.data || path.join(process.cwd(), '.lynx-server-data');

  console.log(chalk.cyan('\n🚀 Starting Lynx Hot Update Server...\n'));

  const serverPath = path.join(__dirname, '..', '..', 'server', 'index.js');
  
  const env = {
    ...process.env,
    PORT: port.toString(),
    DATA_DIR: dataDir
  };

  const child = spawn('node', [serverPath], {
    env,
    stdio: 'inherit'
  });

  child.on('error', (error) => {
    console.error(chalk.red('Failed to start server:'), error.message);
    process.exit(1);
  });

  child.on('exit', (code) => {
    if (code !== 0) {
      console.error(chalk.red(`Server exited with code ${code}`));
    }
  });

  // 处理 Ctrl+C
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nShutting down server...'));
    child.kill();
    process.exit(0);
  });
}

module.exports = serverCommand;
