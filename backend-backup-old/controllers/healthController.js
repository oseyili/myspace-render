const monitoring = require("../services/monitoring");
function status(req, res) { res.json(monitoring.status()); }
module.exports = { status };
