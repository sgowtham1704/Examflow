# ExamFlow — Student Examination Management System

## Requirements
Node.js 24+ (your Node v24.21.0 works). No XAMPP, MySQL, PHP or npm packages required.

## Run in VS Code PowerShell
1. Extract this ZIP into a **new folder**, e.g. `C:\Users\GAMING\Downloads\ExamFlow_Node_SQLite`.
2. Open that folder in VS Code (File > Open Folder).
3. Terminal > New Terminal.
4. Run `npm install` (optional: there are no external dependencies).
5. Run `npm start`.
6. Visit http://localhost:3000

The SQLite database is created automatically at `database/examination.db` on first launch.

## Demo logins
Student (Aparna): `24AIDS001` / `student123`
Admin: `admin` / `admin123`

## Features
Student: login, overview, exam timetable, hall ticket with print, results, announcements.
Admin: dashboard, add students, subjects, exams, timetable entries, marks, announcements; view students.
Passwords use scrypt with random salt; sessions use an HttpOnly SameSite cookie.

## Important
This is a local academic demo, not a production system. Use HTTPS, CSRF protection,
rate limiting, backups and production-grade session storage before deployment.
Do not share the seeded demo passwords or use them for real accounts.

## Troubleshooting
- If `npm` is blocked in PowerShell, run `npm.cmd start`.
- If port 3000 is busy, use `$env:PORT=3001; npm start` then http://localhost:3001.
- Do not open `public/index.html` directly: visit the localhost URL.
- The old PHP project is separate and is not needed.
