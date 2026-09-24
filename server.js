'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');

const ROOT=__dirname, DB_DIR=path.join(ROOT,'database');
fs.mkdirSync(DB_DIR,{recursive:true});
const db=new DatabaseSync(path.join(DB_DIR,'examination.db'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
db.exec(`
CREATE TABLE IF NOT EXISTS departments(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY, register_no TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT, department_id INTEGER NOT NULL REFERENCES departments(id), semester INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('student','admin')), student_id INTEGER REFERENCES students(id));
CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, semester INTEGER NOT NULL, credits INTEGER NOT NULL DEFAULT 3);
CREATE TABLE IF NOT EXISTS exams(id INTEGER PRIMARY KEY, name TEXT NOT NULL, academic_year TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Upcoming');
CREATE TABLE IF NOT EXISTS halls(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, capacity INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS timetable(id INTEGER PRIMARY KEY, exam_id INTEGER NOT NULL REFERENCES exams(id), subject_id INTEGER NOT NULL REFERENCES subjects(id), hall_id INTEGER NOT NULL REFERENCES halls(id), exam_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), exam_id INTEGER NOT NULL REFERENCES exams(id), UNIQUE(student_id,exam_id));
CREATE TABLE IF NOT EXISTS allocations(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), timetable_id INTEGER NOT NULL REFERENCES timetable(id), seat_no TEXT NOT NULL, UNIQUE(student_id,timetable_id));
CREATE TABLE IF NOT EXISTS marks(id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), exam_id INTEGER NOT NULL REFERENCES exams(id), subject_id INTEGER NOT NULL REFERENCES subjects(id), internal INTEGER NOT NULL, external INTEGER NOT NULL, grade TEXT NOT NULL, UNIQUE(student_id,exam_id,subject_id));
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY, title TEXT NOT NULL, message TEXT NOT NULL, priority TEXT NOT NULL DEFAULT 'Normal', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
`);
function hashPassword(p,salt=crypto.randomBytes(16).toString('hex')){return salt+':'+crypto.scryptSync(p,salt,64).toString('hex')}
function checkPassword(p,stored){const [salt,hex]=stored.split(':');if(!salt||!hex)return false;const a=crypto.scryptSync(p,salt,64),b=Buffer.from(hex,'hex');return a.length===b.length&&crypto.timingSafeEqual(a,b)}
if(!db.prepare('SELECT id FROM users LIMIT 1').get()){
 const run=(q,...p)=>db.prepare(q).run(...p);
 run("INSERT INTO departments(code,name) VALUES(?,?)",'AIDS','Artificial Intelligence & Data Science');
 run("INSERT INTO students(register_no,name,email,department_id,semester) VALUES(?,?,?,?,?)",'24AIDS001','Aparna','aparna@example.com',1,5);
 run("INSERT INTO students(register_no,name,email,department_id,semester) VALUES(?,?,?,?,?)",'24AIDS002','Mohanapriya','mohanapriya@example.com',1,5);
 run("INSERT INTO students(register_no,name,email,department_id,semester) VALUES(?,?,?,?,?)",'24AIDS003','Tejaswini K M','tejaswini@example.com',1,5);
 run("INSERT INTO users(username,password_hash,role,student_id) VALUES(?,?,?,?)",'admin',hashPassword('admin123'),'admin',null);
 run("INSERT INTO users(username,password_hash,role,student_id) VALUES(?,?,?,?)",'24AIDS001',hashPassword('student123'),'student',1);
 [['DB501','Database Management Systems',4],['AI501','Artificial Intelligence',4],['DS501','Data Science',4],['SE501','Software Engineering',3]].forEach(x=>run('INSERT INTO subjects(code,name,semester,credits) VALUES(?,?,5,?)',...x));
 run("INSERT INTO exams(name,academic_year,status) VALUES(?,?,?)",'Odd Semester Examination 2026','2026-27','Upcoming');
 [['H101',60],['H102',60],['H201',80]].forEach(x=>run('INSERT INTO halls(code,capacity) VALUES(?,?)',...x));
 [[1,1,'2026-11-10',1],[2,2,'2026-11-13',2],[3,3,'2026-11-17',3],[4,1,'2026-11-20',4]].forEach(([sub,hall,date,id])=>run('INSERT INTO timetable(id,exam_id,subject_id,hall_id,exam_date,start_time,end_time) VALUES(?,?,?,?,?,?,?)',id,1,sub,hall,date,'09:30','12:30'));
 run('INSERT INTO registrations(student_id,exam_id) VALUES(?,?)',1,1);
 ['A-14','B-08','C-21','A-14'].forEach((seat,i)=>run('INSERT INTO allocations(student_id,timetable_id,seat_no) VALUES(?,?,?)',1,i+1,seat));
 [[1,21,70,'A+'],[2,20,66,'A'],[3,18,60,'B'],[4,22,66,'A']].forEach(([sub,i,e,g])=>run('INSERT INTO marks(student_id,exam_id,subject_id,internal,external,grade) VALUES(?,?,?,?,?,?)',1,1,sub,i,e,g));
 run("INSERT INTO announcements(title,message,priority) VALUES(?,?,?)",'Exam Registration Open','Complete your registration before 28 October 2026.','Important');
 run("INSERT INTO announcements(title,message,priority) VALUES(?,?,?)",'Hall Ticket Notice','Hall tickets are available for registered students.','Normal');
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.ico':'image/x-icon'};
const sessions=()=>{db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now())};
function json(res,status,obj){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(obj))}
function parseCookies(s=''){return Object.fromEntries(s.split(';').map(x=>x.trim().split('=').map(decodeURIComponent)).filter(x=>x.length===2))}
function currentUser(req){const token=parseCookies(req.headers.cookie).session;if(!token)return null;const row=db.prepare('SELECT u.id,u.username,u.role,u.student_id,s.name,s.register_no FROM sessions se JOIN users u ON u.id=se.user_id LEFT JOIN students s ON s.id=u.student_id WHERE se.token_hash=? AND se.expires_at>?').get(crypto.createHash('sha256').update(token).digest('hex'),Date.now());return row||null}
async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>100000)throw Error('Request too large')}try{return JSON.parse(raw||'{}')}catch{throw Error('Invalid JSON')}}
const get=(q,...p)=>db.prepare(q).get(...p),all=(q,...p)=>db.prepare(q).all(...p),run=(q,...p)=>db.prepare(q).run(...p);
const str=(v,max=150)=>typeof v==='string'?v.trim().slice(0,max):'';
const int=v=>Number.isSafeInteger(Number(v))&&Number(v)>0?Number(v):null;
const grades=n=>n>=90?'A+':n>=80?'A':n>=70?'B':n>=60?'C':n>=50?'D':'F';
async function api(req,res,url){
 const route=url.pathname,method=req.method;
 if(route==='/api/login'&&method==='POST'){
   const b=await body(req),u=get('SELECT * FROM users WHERE username=?',str(b.username,80));
   if(!u||!checkPassword(String(b.password||''),u.password_hash))return json(res,401,{error:'Invalid username or password'});
   sessions();const token=crypto.randomBytes(32).toString('hex');
   run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',crypto.createHash('sha256').update(token).digest('hex'),u.id,Date.now()+86400000);
   res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400`);
   return json(res,200,{ok:true});
 }
 if(route==='/api/logout'&&method==='POST'){
   const token=parseCookies(req.headers.cookie).session;
   if(token)run('DELETE FROM sessions WHERE token_hash=?',crypto.createHash('sha256').update(token).digest('hex'));
   res.setHeader('Set-Cookie','session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
   return json(res,200,{ok:true});
 }
 const u=currentUser(req);if(!u)return json(res,401,{error:'Please sign in'});
 if(route==='/api/me')return json(res,200,u);
 if(route==='/api/dashboard'){
   if(u.role==='admin')return json(res,200,{students:get('SELECT count(*) n FROM students').n,subjects:get('SELECT count(*) n FROM subjects').n,exams:get('SELECT count(*) n FROM exams').n,announcements:get('SELECT count(*) n FROM announcements').n});
   const m=get('SELECT count(*) n,round(avg(internal+external),1) average FROM marks WHERE student_id=?',u.student_id);
   return json(res,200,{registered:get('SELECT count(*) n FROM registrations WHERE student_id=?',u.student_id).n,results:m.n,average:m.average||0,upcoming:get("SELECT count(*) n FROM timetable WHERE exam_date>=date('now')").n});
 }
 if(route==='/api/announcements'&&method==='GET')return json(res,200,all('SELECT * FROM announcements ORDER BY id DESC'));
 if(route==='/api/timetable'&&method==='GET')return json(res,200,all(`SELECT t.id,t.exam_date,t.start_time,t.end_time,s.code,s.name subject,h.code hall,coalesce(a.seat_no,'—') seat FROM timetable t JOIN subjects s ON s.id=t.subject_id JOIN halls h ON h.id=t.hall_id LEFT JOIN allocations a ON a.timetable_id=t.id AND a.student_id=? ORDER BY t.exam_date`,u.student_id||-1));
 if(route==='/api/results'&&method==='GET'){
   if(u.role==='admin')return json(res,200,all('SELECT m.*,s.name student,sub.name subject,sub.code FROM marks m JOIN students s ON s.id=m.student_id JOIN subjects sub ON sub.id=m.subject_id ORDER BY m.id DESC'));
   return json(res,200,all('SELECT m.*,sub.name subject,sub.code FROM marks m JOIN subjects sub ON sub.id=m.subject_id WHERE m.student_id=? ORDER BY sub.code',u.student_id));
 }
 if(route==='/api/ticket'&&method==='GET'){
   if(u.role==='admin')return json(res,403,{error:'Student account required'});
   return json(res,200,{student:u,exams:all(`SELECT e.name exam,e.academic_year,t.exam_date,t.start_time,t.end_time,s.code,s.name subject,h.code hall,a.seat_no seat FROM registrations r JOIN exams e ON e.id=r.exam_id JOIN timetable t ON t.exam_id=e.id JOIN subjects s ON s.id=t.subject_id JOIN halls h ON h.id=t.hall_id JOIN allocations a ON a.timetable_id=t.id AND a.student_id=r.student_id WHERE r.student_id=? ORDER BY t.exam_date`,u.student_id)});
 }
 if(u.role!=='admin')return json(res,403,{error:'Admin only'});
 if(route==='/api/students'&&method==='GET')return json(res,200,all('SELECT s.*,d.name department FROM students s JOIN departments d ON d.id=s.department_id ORDER BY s.id DESC'));
 if(route==='/api/options'&&method==='GET')return json(res,200,{students:all('SELECT id,register_no,name FROM students'),subjects:all('SELECT id,code,name FROM subjects'),exams:all('SELECT id,name FROM exams'),halls:all('SELECT id,code FROM halls'),departments:all('SELECT id,name FROM departments')});
 if(method!=='POST')return json(res,404,{error:'Not found'});
 const b=await body(req);
 if(route==='/api/students'){
   if(!str(b.register_no,30)||!str(b.name)||!int(b.department_id)||!int(b.semester))return json(res,400,{error:'Complete all required fields'});
   const result=run('INSERT INTO students(register_no,name,email,department_id,semester) VALUES(?,?,?,?,?)',str(b.register_no,30),str(b.name),str(b.email),int(b.department_id),int(b.semester));
   if(str(b.password))run('INSERT INTO users(username,password_hash,role,student_id) VALUES(?,?,?,?)',str(b.register_no,30),hashPassword(str(b.password,200)),'student',Number(result.lastInsertRowid));
 }
 else if(route==='/api/subjects'){
   if(!str(b.code,30)||!str(b.name)||!int(b.semester)||!int(b.credits))return json(res,400,{error:'Complete all required fields'});
   run('INSERT INTO subjects(code,name,semester,credits) VALUES(?,?,?,?)',str(b.code,30),str(b.name),int(b.semester),int(b.credits));
 }
 else if(route==='/api/exams'){
   if(!str(b.name)||!str(b.academic_year,20))return json(res,400,{error:'Complete all required fields'});
   run('INSERT INTO exams(name,academic_year) VALUES(?,?)',str(b.name),str(b.academic_year,20));
 }
 else if(route==='/api/timetable'){
   if(!int(b.exam_id)||!int(b.subject_id)||!int(b.hall_id)||!/^\d{4}-\d\d-\d\d$/.test(str(b.exam_date,10))||!/^\d\d:\d\d$/.test(str(b.start_time,5))||!/^\d\d:\d\d$/.test(str(b.end_time,5)))return json(res,400,{error:'Complete all required fields'});
   run('INSERT INTO timetable(exam_id,subject_id,hall_id,exam_date,start_time,end_time) VALUES(?,?,?,?,?,?)',int(b.exam_id),int(b.subject_id),int(b.hall_id),str(b.exam_date,10),str(b.start_time,5),str(b.end_time,5));
 }
 else if(route==='/api/marks'){
   const i=Number(b.internal),e=Number(b.external);
   if(!int(b.student_id)||!int(b.exam_id)||!int(b.subject_id)||!Number.isInteger(i)||!Number.isInteger(e)||i<0||i>25||e<0||e>75)return json(res,400,{error:'Enter valid IDs and marks (internal 0–25, external 0–75)'});
   run('INSERT INTO marks(student_id,exam_id,subject_id,internal,external,grade) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,exam_id,subject_id) DO UPDATE SET internal=excluded.internal,external=excluded.external,grade=excluded.grade',int(b.student_id),int(b.exam_id),int(b.subject_id),i,e,grades(i+e));
 }
 else if(route==='/api/announcements'){
   if(!str(b.title)||!str(b.message,2000))return json(res,400,{error:'Title and message required'});
   run('INSERT INTO announcements(title,message,priority) VALUES(?,?,?)',str(b.title),str(b.message,2000),['Normal','Important','Urgent'].includes(b.priority)?b.priority:'Normal');
 }
 else if(route==='/api/register'){
   if(!int(b.student_id)||!int(b.exam_id))return json(res,400,{error:'Select student and exam'});
   run('INSERT OR IGNORE INTO registrations(student_id,exam_id) VALUES(?,?)',int(b.student_id),int(b.exam_id));
 }
 else if(route==='/api/allocate'){
   if(!int(b.student_id)||!int(b.timetable_id)||!str(b.seat_no,20))return json(res,400,{error:'Select student, timetable ID and seat'});
   run('INSERT INTO allocations(student_id,timetable_id,seat_no) VALUES(?,?,?) ON CONFLICT(student_id,timetable_id) DO UPDATE SET seat_no=excluded.seat_no',int(b.student_id),int(b.timetable_id),str(b.seat_no,20));
 }
 else return json(res,404,{error:'Not found'});
 return json(res,200,{ok:true,message:'Saved successfully'});
}
const publicDir=path.join(ROOT,'public');
const server=http.createServer(async(req,res)=>{
 try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.startsWith('/api/'))return await api(req,res,url);
   if(req.method!=='GET')return json(res,405,{error:'Method not allowed'});
   const target=path.resolve(publicDir,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!target.startsWith(publicDir+path.sep))return json(res,403,{error:'Forbidden'});
   const ext=path.extname(target);
   if(!MIME[ext])return json(res,404,{error:'Not found'});
   fs.readFile(target,(err,data)=>{if(err)return json(res,404,{error:'File not found'});res.writeHead(200,{'Content-Type':MIME[ext],'X-Content-Type-Options':'nosniff'});res.end(data)});
 }catch(err){console.error(err);return json(res,err.code?.startsWith('SQLITE_CONSTRAINT')?400:500,{error:err.code?.startsWith('SQLITE_CONSTRAINT')?'Duplicate or invalid related record':err.message==='Invalid JSON'?'Invalid JSON':'Request failed'})}
});
const PORT=Number(process.env.PORT)||3000;
server.listen(PORT,()=>console.log(`ExamFlow running at http://localhost:${PORT}`));
