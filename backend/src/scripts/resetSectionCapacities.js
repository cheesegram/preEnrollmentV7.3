import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import Section from '../models/Section.js';

dotenv.config();

dns.setServers(['1.1.1.1', '1.0.0.1']);

const DEFAULT_REGULAR_CAPACITY = 45;
const DEFAULT_IRREGULAR_CAPACITY = 5;
const DEFAULT_TOTAL_CAPACITY = 50;

function toStatus(regular, irregular, regularCapacity) {
  const regularCount = Number(regular || 0);
  const capacity = Number(regularCapacity || DEFAULT_REGULAR_CAPACITY);
  if (regularCount < capacity) return 'Available';
  if (regularCount === capacity) return 'Full';
  return 'Overloaded';
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Ensure you run this from the backend folder where -DESKTOP-2T3MSLV.env exists.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const sections = await Section.find({}).lean();
    const bulkOps = sections.map((section) => ({
      updateOne: {
        filter: { _id: section._id },
        update: {
          $set: {
            regular_capacity: DEFAULT_REGULAR_CAPACITY,
            irregular_capacity: DEFAULT_IRREGULAR_CAPACITY,
            total_capacity: DEFAULT_TOTAL_CAPACITY,
            status: toStatus(section.regular, section.irregular, DEFAULT_REGULAR_CAPACITY),
          },
        },
      },
    }));

    if (bulkOps.length > 0) {
      const result = await Section.bulkWrite(bulkOps, { ordered: false });
      console.log(`Updated ${result.modifiedCount ?? 0} sections`);
    } else {
      console.log('No sections found to update');
    }

    process.exit(0);
  } catch (error) {
    console.error('Reset section capacities failed', error);
    process.exit(1);
  }
}

main();