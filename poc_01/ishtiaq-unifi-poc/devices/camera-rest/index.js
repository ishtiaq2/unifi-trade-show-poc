const { createRestDevice } = require("../_shared/rest-simulator");
const profile = require("./profile");

const app = createRestDevice(profile);
app.listen(profile.port, () => {
  console.log(`[${profile.name}] REST device simulator listening on :${profile.port}`);
});
