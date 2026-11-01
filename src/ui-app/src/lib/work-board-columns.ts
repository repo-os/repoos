import { COLUMNS } from "../stores/repo";

/** Status columns on /work: draft plus the pipeline columns from `COLUMNS`. */
export const WORK_BOARD_COLUMN_COUNT = 1 + COLUMNS.length;

/** Status columns on /inputs (New / Reviewing / Processed). */
export const INPUT_BOARD_COLUMN_COUNT = 3;
