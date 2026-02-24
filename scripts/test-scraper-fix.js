/**
 * Quick test of the scraper fix — does it click through search results to a listing?
 */
const { scrapeHOAReviews } = require('../server/services/googleReviewsScraper');

(async () => {
  console.log('Testing scraper with "Sentry Management FL"...\n');

  const result = await scrapeHOAReviews(
    { name: 'Sentry Management', city: '', state: 'FL' },
    { maxReviews: 10, isFirstScrape: true }
  );

  console.log('\n=== Result ===');
  console.log(`Success: ${result.success}`);
  console.log(`Reviews: ${result.reviews?.length || 0}`);
  console.log(`Metadata:`, result.metadata);
  console.log(`Maps URL: ${result.maps_url}`);

  if (result.reviews?.length > 0) {
    console.log('\nFirst review:');
    console.log(JSON.stringify(result.reviews[0], null, 2));
  }

  process.exit(0);
})().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
