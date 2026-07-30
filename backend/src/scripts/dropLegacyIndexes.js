import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';

dotenv.config();
dns.setServers(['1.1.1.1', '1.0.0.1']);

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const studentsCollection = mongoose.connection.db.collection('students');
    const indexes = await studentsCollection.listIndexes().toArray();
    console.log('Current student indexes:');
    indexes.forEach((i) => console.log(`  ${i.name}: ${JSON.stringify(i.key)} unique=${i.unique}`));

    // Drop legacy snake_case index if it exists
    const hasLegacyIndex = indexes.some((i) => i.name === 'student_number_1');
    if (hasLegacyIndex) {
      console.log('\nDropping legacy index: student_number_1');
      await studentsCollection.dropIndex('student_number_1');
      console.log('Legacy index dropped successfully');
    } else {
      console.log('\nNo legacy student_number_1 index found');
    }

    // Verify remaining indexes
    const remaining = await studentsCollection.listIndexes().toArray();
    console.log('\nRemaining student indexes:');
    remaining.forEach((i) => console.log(`  ${i.name}: ${JSON.stringify(i.key)} unique=${i.unique}`));

    process.exit(0);
  } catch (error) {
    console.error('Failed to drop legacy indexes', error);
    process.exit(1);
  }
}

main();