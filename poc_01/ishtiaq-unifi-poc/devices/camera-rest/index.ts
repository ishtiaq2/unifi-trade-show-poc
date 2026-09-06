import { createRestDevice } from "../_shared/rest-simulator";
import profile from "./profile";

const app = createRestDevice(profile);

app.listen(profile.port, () => {
  console.log(`[${profile.name}] REST device simulator listening on :${profile.port}`);
});
