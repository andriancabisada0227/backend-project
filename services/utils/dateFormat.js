const formatDate = (date) => {
  const pad = (num) => num.toString().padStart(2, "0");

  const day = pad(date.getDate());
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${day} ${month} ${year} ${hours}:${minutes}`;
};

module.exports = formatDate;
