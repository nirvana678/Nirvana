require('dotenv').config();
const mongoose=require('mongoose');
const bcrypt=require('bcryptjs');
const crypto=require('crypto');
const fs=require('fs/promises');
const path=require('path');
const {User}=require('./models');
async function run(){
 await mongoose.connect(process.env.MONGODB_URI);
 const existing=await User.findOne({role:'admin'}).select('email');
 if(existing){console.log(`An administrator already exists: ${existing.email}. No credentials changed.`);await mongoose.disconnect();return}
 const email='admin@nirvana.local',password=crypto.randomBytes(18).toString('base64url');
 await User.create({name:'Nirvana Admin',email,role:'admin',passwordHash:await bcrypt.hash(password,12)});
 const output=path.resolve(__dirname,'../../ADMIN-ACCESS.local.txt');
 await fs.writeFile(output,`NIRVANA ADMIN ACCESS\n\nComputer: http://localhost:4200/admin\nPhone (same Wi-Fi): http://192.168.1.175:4200/admin\n\nEmail: ${email}\nPassword: ${password}\n\nSign in, then open My password to choose your own password.\nThis local credential file is excluded from Git. Delete it after changing the password.\nThe computer and both npm servers must remain running for phone access.\n`);
 console.log(`Administrator created. Credentials saved to ${output}`);await mongoose.disconnect();
}
run().catch(async e=>{console.error(e.message);await mongoose.disconnect();process.exit(1)});
