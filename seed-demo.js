// Creates optional demo accounts/listings for a local TA demonstration.
// It never deletes existing data. Run: npm run seed
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dir = process.env.BORROWBUDDY_DATA_DIR || path.join(__dirname,'data');
const file = path.join(dir,'borrowbuddy.json');
fs.mkdirSync(dir,{recursive:true});
const db = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file,'utf8')) : { users: [], items: [], requests:[] };
const now = new Date().toISOString();
function addUser(name,email) {
  let u=db.users.find(u => u.email === email);
  if (u) return u;
  const salt=crypto.randomBytes(16).toString('hex');
  u={id:crypto.randomUUID(),name,email,passwordSalt:salt,passwordHash:crypto.scryptSync('DemoPass123!',salt,64).toString('hex'),createdAt:now};
  db.users.push(u); return u;
}
const maya=addUser('Maya Chen','maya@borrowbuddy.demo');
const jordan=addUser('Jordan Lee','jordan@borrowbuddy.demo');
const entries=[
  [maya,'TI-84 Plus Graphing Calculator','School Supplies','Good','Willis Library lobby','Perfect for math and statistics exams. Includes fresh batteries and carrying case.'],
  [maya,'Canon EOS Rebel Camera','Electronics','Like new','UNT Union, first floor','Digital camera with charged battery and a memory card for media projects.'],
  [maya,'Portable Mini Projector','Electronics','Good','Discovery Park atrium','Compact projector with HDMI cable for presentations and movie nights.'],
  [jordan,'Cordless Drill Set','Tools','Good','UNT Union, first floor','Battery-powered drill set for a quick furniture assembly or repair.'],
  [jordan,'Introduction to Networking Textbook','Textbooks','Fair','Willis Library lobby','Used networking textbook with notes in the margins, useful for course review.'],
  [jordan,'Camping Lantern','Outdoor','Like new','Eagle Landing entrance','Rechargeable lantern for short campus and outdoor events.']
];
for (const [owner,title,category,condition,location,description] of entries) {
  if (db.items.some(i=>i.ownerId===owner.id && i.title===title)) continue;
  db.items.push({id:crypto.randomUUID(),ownerId:owner.id,title,category,condition,location,description,isListed:true,createdAt:now,updatedAt:now});
}
fs.writeFileSync(file,JSON.stringify(db,null,2));
console.log('Demo ready: maya@borrowbuddy.demo and jordan@borrowbuddy.demo | password: DemoPass123!');
console.log('Demo accounts are for LOCAL TESTING ONLY. Do not expose them on a public deployment.');
