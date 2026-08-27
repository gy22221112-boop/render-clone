const mongoose = require('mongoose');

const deploymentSchema = new mongoose.Schema({
  appId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'App',
    required: true
  },
  commitHash: {
    type: String,
    required: true
  },
  commitMessage: {
    type: String
  },
  status: {
    type: String,
    enum: ['queued', 'building', 'deploying', 'success', 'failed'],
    default: 'queued'
  },
  logs: {
    type: [String],
    default: []
  },
  deployedUrl: {
    type: String
  },
  duration: {
    type: Number
  },
  startedAt: {
    type: Date
  },
  finishedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Deployment', deploymentSchema);
