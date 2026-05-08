const express = require("express");
const router = express.Router();
const {
  listSignals,
  createSignal,
  deleteSignal,
} = require("../controllers/signalController");

router.get("/", listSignals);
router.post("/", createSignal);
router.delete("/:id", deleteSignal);

module.exports = router;
