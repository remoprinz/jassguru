import fs from 'fs';
import path from 'path';
import { allJassContent } from '../../jassguruchat/src/data/jassContent/index.ts';

const main = async () => {
  console.log('🚀 Starting content synchronization...');

  try {
    const outputDir = path.resolve(process.cwd(), 'src/data');
    const outputFile = path.resolve(outputDir, 'jass-lexikon.json');

    // Create directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
      console.log(`✅ Created directory: ${outputDir}`);
    }

    // Prepare content for JSON serialization
    const contentAsJson = JSON.stringify(allJassContent, null, 2);

    // Write to file
    fs.writeFileSync(outputFile, contentAsJson, 'utf-8');

    console.log(`✅ Successfully synchronized ${Object.keys(allJassContent).length} content items.`);
    console.log(`📝 Content written to: ${outputFile}`);
    
  } catch (error) {
    console.error('🔥 Error during content synchronization:', error);
    process.exit(1);
  }

  console.log('🎉 Content synchronization finished.');
};

main(); 