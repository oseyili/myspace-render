const orchestrator = require("../services/search/searchOrchestrator");
async function search(req, res, next) { try { res.json(await orchestrator.searchHotels(req.query)); } catch (err) { next(err); } }
async function selectedLiveRate(req, res, next) { try { res.json(await orchestrator.selectedLiveRate(req.query)); } catch (err) { next(err); } }
module.exports = { search, selectedLiveRate };
