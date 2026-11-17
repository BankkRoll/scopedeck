import {
  columnSizingFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_datetime,
  sortFn_text,
  tableFeatures,
  type ColumnHelper,
  type RowData,
} from "@tanstack/react-table";

export const tableFeatureSet = tableFeatures({
  columnSizingFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    datetime: sortFn_datetime,
    text: sortFn_text,
  },
});

export type TableFeatureSet = typeof tableFeatureSet;

export type Columns<T extends RowData> = ReturnType<ColumnHelper<TableFeatureSet, T>["columns"]>;

export function columnHelper<T extends RowData>(): ColumnHelper<TableFeatureSet, T> {
  return createColumnHelper<TableFeatureSet, T>();
}
