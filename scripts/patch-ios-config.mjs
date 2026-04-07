import { readFileSync, writeFileSync } from 'fs';

const path = 'ios/App/App/capacitor.config.json';
const config = JSON.parse(readFileSync(path, 'utf-8'));

config.server = config.server || {};
config.server.url = 'https://trail-five.vercel.app';

writeFileSync(path, JSON.stringify(config, null, '\t') + '\n');
console.log('[patch-ios-config] iOS server.url set to https://trail-five.vercel.app');
