/**
 * Maintenance commands, e.g. (in Docker: docker compose exec -u node app npm run -s cli -w apps/api -- <command>)
 *   user:list
 *   user:add <username> <ADMIN|CONDUCTOR> "<Full name>" <password>
 *   user:passwd <username> <new password>
 *   backup
 *   schedule:extend
 */
import { cfg, loadSecret } from './config.js';
import { openDatabase } from './node-db.js';
import { all, get, run } from './core/sql.js';
import { hashPassword, setSecret, nowLocal } from './core/util.js';
import { extendSchedule } from './core/schedule.js';
import { backup } from './backup.js';

setSecret(loadSecret());
const db = openDatabase(cfg.dbPath);
const [cmd, ...args] = process.argv.slice(2);
const fail = (msg: string) => { console.error(msg); process.exit(1); };

switch (cmd) {
  case 'user:list':
    console.table(all(`SELECT id, username, role, name FROM users ORDER BY id`));
    break;
  case 'user:add': {
    const [username, role, name, password] = args;
    if (!username || !['ADMIN', 'CONDUCTOR'].includes(role) || !name || !password) fail('usage: user:add <username> <ADMIN|CONDUCTOR> "<Full name>" <password>');
    if (password.length < 8) fail('password must have at least 8 characters');
    if (get(`SELECT id FROM users WHERE username = ?`, username)) fail('username already exists');
    run(`INSERT INTO users (username, password_hash, role, name) VALUES (?,?,?,?)`, username, hashPassword(password), role, name);
    console.log(`created ${username} (${role})`);
    break;
  }
  case 'user:passwd': {
    const [username, password] = args;
    if (!username || !password || password.length < 8) fail('usage: user:passwd <username> <new password (8+ characters)>');
    const r = run(`UPDATE users SET password_hash = ? WHERE username = ?`, hashPassword(password), username);
    if (!r.changes) fail('no such user');
    console.log(`password changed for ${username}`);
    break;
  }
  case 'backup':
    backup(db, `trains-${nowLocal().replace(/[:T]/g, '-')}.db`, cfg.backupDir, cfg.backupKeep + 50);
    break;
  case 'schedule:extend':
    console.log(`generated ${extendSchedule(cfg.scheduleDays)} departures`);
    break;
  default:
    console.log('commands: user:list | user:add | user:passwd | backup | schedule:extend');
}
db.close();
