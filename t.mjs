import { PGlite } from "@electric-sql/pglite";
import fs from "fs";
const src = fs.readFileSync("src/integrations/local/schema.ts","utf8");
const m = src.match(/export const SCHEMA_SQL = `([\s\S]*?)`;/);
const SQL = m[1];
function splitSql(sql){const out=[];let buf="";let inD=false;for(let i=0;i<sql.length;i++){if(sql.startsWith("$fn$",i)){inD=!inD;buf+="$fn$";i+=3;continue;}const ch=sql[i];if(ch===";"&&!inD){if(buf.trim())out.push(buf.trim());buf="";}else buf+=ch;}if(buf.trim())out.push(buf.trim());return out.filter(s=>!/^--/.test(s));}
const rank=s=>{if(/^create\s+(table|type|extension|schema)/i.test(s))return 0;if(/primary key|add constraint\s+\S+\s+unique/i.test(s))return 1;if(/foreign key/i.test(s))return 2;return 3;};
const stmts=splitSql(SQL).map((s,i)=>({s,i,r:rank(s)})).sort((a,b)=>a.r-b.r||a.i-b.i).map(x=>x.s);
const db=new PGlite();await db.waitReady;
for(const st of stmts){try{await db.exec(st);}catch(e){console.log("FAIL:",st.slice(0,140).replace(/\n/g," "),"\n  ->",e.message);}}
