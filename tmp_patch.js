const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/command-center/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Insert back button before the <h1
const searchStr = `                     <div>
                         <h1 className="text-3xl lg:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 flex items-center gap-4">`;

const replaceStr = `                     <div>
                         <Link href="/admin" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-3 transition-colors group">
                             <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                             Voltar ao painel
                         </Link>
                         <h1 className="text-3xl lg:text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-cyan-300 flex items-center gap-4">`;

if (!content.includes(searchStr)) {
    console.error('Pattern not found!');
    process.exit(1);
}

content = content.replace(searchStr, replaceStr);
fs.writeFileSync(filePath, content, 'utf8');
console.log('Back button added successfully!');
