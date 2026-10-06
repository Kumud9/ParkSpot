const express = require('express');
const facilityController = require('../controllers/facility.controller');

const router = express.Router();

router.get('/nearby', facilityController.getNearby);
router.get('/', facilityController.listPublic);
router.get('/:id', facilityController.getPublicById);

module.exports = router;
