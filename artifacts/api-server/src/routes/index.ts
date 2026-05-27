import { Router, type IRouter } from "express";
import healthRouter from "./health";
import playersRouter from "./players";
import runsRouter from "./runs";
import eventsRouter from "./events";
import narrativeRouter from "./narrative";
import legacyRouter from "./legacy";
import momentsRouter from "./moments";
import achievementsRouter from "./achievements";
import mapsRouter from "./maps";
import assistRouter from "./assist";
import stateRouter from "./state";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/players", playersRouter);
router.use("/runs", runsRouter);
router.use("/events", eventsRouter);
router.use("/narrative", narrativeRouter);
router.use("/legacy", legacyRouter);
router.use("/moments", momentsRouter);
router.use("/achievements", achievementsRouter);
router.use("/maps", mapsRouter);
router.use("/assist", assistRouter);
router.use("/state", stateRouter);

export default router;
