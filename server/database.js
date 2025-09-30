const mongoose = require('mongoose');

let connectionPromise = null;

async function connectDatabase() {
  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not defined.');
  }

  mongoose.set('strictQuery', true);

  connectionPromise = mongoose
    .connect(uri, {
      serverSelectionTimeoutMS: 5000,
    })
    .then((connection) => {
      console.log('MongoDB Connected');
      return connection;
    })
    .catch((error) => {
      connectionPromise = null;
      throw error;
    });

  return connectionPromise;
}

module.exports = {
  connectDatabase,
};
