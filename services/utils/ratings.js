const computeRatings = async (reviews) => {
  let totalRatings = 0;
  let numberOfRatings = 0;

  await reviews.forEach((rate) => {
    totalRatings += rate.rating;
    numberOfRatings++;
  });

  return parseFloat((totalRatings / numberOfRatings).toFixed(1));
};

module.exports = computeRatings;
