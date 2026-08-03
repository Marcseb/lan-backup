import { Router, type IRouter } from "express";
import healthRouter from "./health";
import unlockRouter from "./unlock";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(unlockRouter);
router.use(adminRouter);

export default router;
