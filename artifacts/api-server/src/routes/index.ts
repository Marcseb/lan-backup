import { Router, type IRouter } from "express";
import healthRouter from "./health";
import unlockRouter from "./unlock";

const router: IRouter = Router();

router.use(healthRouter);
router.use(unlockRouter);

export default router;
