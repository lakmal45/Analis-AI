const express = require("express");
const router = express.Router();
const {
  getWatchlists,
  createWatchlist,
  updateWatchlist,
  deleteWatchlist,
} = require("../controllers/watchlistController");

router.get("/", getWatchlists);
router.post("/", createWatchlist);
router.put("/:id", updateWatchlist);
router.delete("/:id", deleteWatchlist);

module.exports = router;
