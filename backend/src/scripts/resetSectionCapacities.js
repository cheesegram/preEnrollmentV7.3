import dotenv from 'dotenv';
import mongoose from 'mongoose';
import dns from 'node:dns/promises';
import Section from '../models/Section.js';
import { DEFAULT_TOTAL_CAPACITY, getSectionCapacities, getSectionStatus } from '../services/sectionService.js';

dotenv.config();

dns.setServers(['1.1.1.1', '1.0.0.1']);

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set. Ensure you run this from the backend folder where -DESKTOP-2T3MSLV.env exists.');
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const sections = await Section.find({}).lean();
    const bulkOps = sections.map((section) => {
      const capacities = getSectionCapacities(DEFAULT_TOTAL_CAPACITY);
      return {
        updateOne: {
          filter: { _id: section._id },
          update: {
            $set: {
              blockCapacity: capacities.blockCapacity,
              irregularCapacity: capacities.irregularCapacity,
              totalCapacity: capacities.totalCapacity,
              status: getSectionStatus(section.blockCount, section.irregularCount, capacities.totalCapacity),
            },
          },
        },
      };
    });

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
