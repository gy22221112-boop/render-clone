const mongoose = require('mongoose');

const appSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  repository: {
    type: String,
    required: true
  },
  branch: {
    type: String,
    default: 'main'
  },
  buildCommand: {
    type: String,
    default: 'npm install && npm run build'
  },
  startCommand: {
    type: String,
    default: 'npm start'
  },
  envVars: {
    type: Map,
    of: String,
    default: {}
  },
  status: {
    type: String,
    enum: ['pending', 'building', 'deployed', 'failed', 'stopped'],
    default: 'pending'
  },
  deployedAt: {
    type: Date
  },
  url: {
    type: String
  },
  containerId: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

appSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('App', appSchema);
