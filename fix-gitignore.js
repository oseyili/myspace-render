const fs = require("fs");
const p = ".gitignore";
let content = fs.readFileSync(p, "utf8");

content = content.replace(/^data\/\s*$/gm, "# data/ (removed)");
content = content.replace(/^\*\*\/data\/\s*$/gm, "# **/data/ (removed)");
content = content.replace(/^backend\/legacy\/\s*$/gm, "# backend/legacy/ (removed)");

fs.writeFileSync(p, content);
console.log("SUCCESS: removed blocking rules from .gitignore");
