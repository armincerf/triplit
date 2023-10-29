import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip } from '@/components/ui/tooltip-simple';
import { cn } from '@/lib/utils';
import { SetInput } from '@/components/ui/set-input';
import { PARSE_FUNCS } from './create-entity-sheet';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { TriplitClient } from '@triplit/client';
import { AttributeDefinition } from '@triplit/db';
import {
  CollectionTypeKeys,
  QueryAttributeDefinition,
  ValueTypeKeys,
} from '../../../db/src/data-types/serialization';
import { ArrowSquareOut } from '@phosphor-icons/react';

async function updateTriplitValue(
  attribute: string,
  client: TriplitClient,
  collection: string,
  entityId: string,
  value: TriplitDataTypes
) {
  try {
    await client.update(collection, entityId, async (originalEntity) => {
      originalEntity[attribute] = value;
    });
  } catch (e) {
    console.error(e);
  }
}

async function updateTriplitSet(
  attribute: string,
  client: TriplitClient,
  collection: string,
  entityId: string,
  value: TriplitDataTypes,
  action: 'add' | 'delete'
) {
  try {
    await client.update(collection, entityId, async (originalEntity) => {
      action === 'add'
        ? originalEntity[attribute].add(value)
        : originalEntity[attribute].delete(value);
    });
  } catch (e) {
    console.error(e);
  }
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

type ColumnHeaderProps = {
  attribute: string;
  onClickHeader?: () => void;
  rightIcon?: React.ReactNode;
  attributeDef?: AttributeDefinition;
} & React.HTMLAttributes<HTMLDivElement>;

export function TriplitColumnHeader(props: ColumnHeaderProps) {
  const { attribute, onClickHeader, rightIcon, attributeDef, children } = props;
  return (
    <div
      className="flex flex-row gap-2 items-center justify-between text-xs px-4 w-full h-full"
      onClick={onClickHeader}
    >
      <div className="flex flex-row items-center gap-1">
        <div className="">{attribute}</div>
        {attributeDef?.type && (
          <div className="font-normal text-zinc-500">{attributeDef.type}</div>
        )}
        {children}
      </div>
      {rightIcon}
    </div>
  );
}

export type TriplitDataTypes = string | number | boolean | Date | null;

type TriplitDataCellProps = {
  entityId: string;
  selected: boolean;
  client: TriplitClient<any>;
  collection: string;
  attribute: string;
  value: TriplitDataTypes;
  attributeDef?: AttributeDefinition;
  onSelectCell: () => void;
};

function SetCellContents({
  triplitSet,
  setType,
  limit = 3,
  className,
}: {
  triplitSet: Set<any>;
  setType?: ValueTypeKeys;
  limit?: number;
  className?: string;
}) {
  if (!triplitSet) return null;
  const items = [...triplitSet];
  return (
    <div className="flex flex-row gap-1 items-center">
      <div className="text-zinc-500">{'{'}</div>
      {items.slice(0, limit).map((item) => (
        <div
          key={item}
          className={cn('bg-secondary px-1 py-0.5 rounded-sm', className)}
        >
          <CellValue value={item} type={setType} />
        </div>
      ))}
      {items.length > limit && (
        <Tooltip
          label={
            <SetCellContents
              triplitSet={triplitSet}
              limit={Infinity}
              className="bg-zinc-200"
            />
          }
        >
          <div className="text-zinc-500">+{items.length - limit}</div>
        </Tooltip>
      )}
      <div className="text-zinc-500">{'}'}</div>
    </div>
  );
}

function CellValue(props: {
  type: ValueTypeKeys | CollectionTypeKeys;
  setType?: ValueTypeKeys;
  value: TriplitDataTypes;
}) {
  const { type, value, setType } = props;
  if (value === null) return <span className="text-zinc-500">null</span>;
  if (value === undefined) return '';
  if (type === 'set' && value instanceof Set)
    return <SetCellContents setType={setType} triplitSet={value as Set<any>} />;
  if (type === 'date' && value instanceof Date)
    return (value as Date).toISOString();
  return JSON.stringify(value);
}

type TriplitRelationCellProps = {
  queryDef: QueryAttributeDefinition;
  onClickRelationLink: () => void;
};

export function RelationCell({
  queryDef,
  onClickRelationLink,
}: TriplitRelationCellProps) {
  const { collectionName: linkedCollection } = queryDef?.query;
  return (
    <Button
      variant={'link'}
      className="text-blue-500 text-xs py-2 px-4 h-auto"
      onClick={onClickRelationLink}
    >
      {linkedCollection} <ArrowSquareOut className="w-3 h-3 ml-1" />
    </Button>
  );
}

export function DataCell(props: TriplitDataCellProps) {
  const {
    value,
    entityId,
    attribute,
    attributeDef,
    onSelectCell,
    selected,
    client,
    collection,
  } = props;
  const isSet = attributeDef?.type === 'set';
  const setType = isSet ? attributeDef.items.type : undefined;
  const [isEditing, setIsEditing] = useState(false);
  useEffect(() => {
    if (!selected) setIsEditing(false);
  }, [selected]);
  return (
    <Popover open={isEditing} onOpenChange={setIsEditing}>
      <PopoverTrigger
        onClick={() => {
          onSelectCell();
          selected && setIsEditing(!isEditing);
        }}
        className={`text-left px-3 py-2 border w-full h-full ${
          selected ? 'border-blue-600' : 'border-transparent'
        }`}
      >
        <CellValue
          setType={setType}
          type={attributeDef?.type ?? 'string'}
          value={value}
        />
      </PopoverTrigger>

      <PopoverContent className="text-xs p-1">
        {isSet && setType ? (
          <SetCellEditor
            set={value}
            setType={setType}
            onChangeSet={(value, action) => {
              updateTriplitSet(
                attribute,
                client,
                collection,
                entityId,
                value,
                action
              );
            }}
          />
        ) : (
          <ValueCellEditor
            value={value}
            nullable={attributeDef && attributeDef.options?.nullable}
            onBlur={() => setIsEditing(false)}
            type={attributeDef?.type}
            onSubmit={(newValue: TriplitDataTypes) => {
              if (newValue !== value)
                updateTriplitValue(
                  attribute,
                  client,
                  collection,
                  entityId,
                  newValue
                );
              setIsEditing(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

type SetCellEditorProps = {
  onChangeSet(value: string, action: 'add' | 'delete'): void;
  set: Set<string> | undefined;
  setType: ValueTypeKeys;
};

function SetCellEditor(props: SetCellEditorProps) {
  const { set, onChangeSet, setType } = props;
  return (
    <SetInput
      value={set}
      onAddItem={(value) => {
        onChangeSet(value, 'add');
      }}
      onRemoveItem={(value) => {
        onChangeSet(value, 'delete');
      }}
      parse={PARSE_FUNCS[setType]}
      renderItem={(value) => <CellValue value={value} type={setType} />}
    />
  );
}

type ValueCellEditorProps = {
  value: TriplitDataTypes;
  type?: string;
  onSubmit: (newValue: TriplitDataTypes) => void;
  onBlur: () => void;
  nullable?: boolean;
};

function coerceStringToTriplitType(
  value: string | null | Array<any>,
  type: string
) {
  if (value === null || value === null) return value;
  if (type === 'number') return Number(value);
  if (type === 'boolean') return JSON.parse(value);
  if (type === 'date') return new Date(value);
  if (type.startsWith('set_')) return new Set(value);

  return value;
}

function coerceTriplitTypeToInput(value: TriplitDataTypes, type: string) {
  if (value === null || value === undefined) return '';
  if (type && type === 'date')
    return new Date(value as string | Date).toISOString();
  return String(value);
}

function ValueCellEditor(props: ValueCellEditorProps) {
  const { value, type, onSubmit, onBlur, nullable } = props;
  const [draftValue, setDraftValue] = useState<string>(
    type ? coerceTriplitTypeToInput(value, type) : JSON.stringify(value)
  );
  const [error, setError] = useState('');
  const EditorInput = useMemo(() => {
    if (type === 'date') return DateInput;
    if (type === 'boolean') return BooleanInput;
    if (type === 'number') return NumberInput;
    return StringInput;
  }, [type]);

  const submitNewValue = useCallback(() => {
    try {
      const submitValue = type
        ? coerceStringToTriplitType(draftValue, type)
        : JSON.parse(draftValue);
      onSubmit(submitValue);
    } catch (e: any) {
      setError(e.message);
    }
  }, [type, draftValue]);

  return (
    <div>
      <EditorInput
        onChange={(newValue) => {
          setDraftValue(newValue);
          setError('');
        }}
        value={draftValue}
      />
      {error && <div className="text-red-500 my-1 text-xs">{error}</div>}
      <div className="flex flex-row gap-1 justify-end mt-1">
        {nullable && (
          <Button
            className="text-xs h-auto py-1 px-2 justify-self-start"
            variant={'ghost'}
            onClick={(e) => {
              onSubmit(null);
            }}
          >
            Set to <Code className="text-xs ml-1">null</Code>
          </Button>
        )}
        <Button
          onClick={(e) => {
            onBlur();
          }}
          size={'sm'}
          className="text-xs h-auto py-1 px-2"
          variant={'outline'}
        >
          Cancel
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault();
            submitNewValue();
          }}
          size={'sm'}
          className="text-xs h-auto py-1 px-2"
        >
          Save
        </Button>
      </div>
    </div>
  );
}

type InputProps = {
  value: string;
  onChange: (newValue: any) => void;
};

function NumberInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Input
      autoFocus
      type="number"
      value={value || undefined}
      onChange={(e) => onChange(e.currentTarget.valueAsNumber)}
    />
  );
}

function BooleanInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Select value={value} onValueChange={(value) => onChange(value)}>
      <SelectTrigger className="text-xs py-0">
        <SelectValue>{value}</SelectValue>
      </SelectTrigger>
      <SelectContent className="text-xs">
        <SelectItem className="text-xs" value={'false'}>
          false
        </SelectItem>
        <SelectItem className="text-xs" value={'true'}>
          true
        </SelectItem>
      </SelectContent>
    </Select>
  );
}

function StringInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Textarea
      className="bg-muted"
      autoFocus
      value={value as string}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

function DateInput(props: InputProps) {
  const { value, onChange } = props;
  return (
    <Input
      autoFocus
      type="text"
      maxLength={24}
      value={value as string}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <Table className="bg-popover text-xs w-full">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id} className={``}>
            {headerGroup.headers.map((header, index) => {
              return (
                <TableHead key={`${header.id}_${index}`} className="px-0">
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </TableHead>
              );
            })}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody className="">
        {table.getRowModel().rows?.length ? (
          table.getRowModel().rows.map((row, index) => (
            <TableRow
              key={row.id}
              data-state={row.getIsSelected() && 'selected'}
            >
              {row.getVisibleCells().map((cell, index) => (
                <TableCell
                  key={`${cell.id}_${index}`}
                  className="truncate w-[50px] p-0"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))
        ) : (
          <TableRow className="bg-popover hover:bg-inherit">
            <TableCell colSpan={columns.length} className="h-24 text-center">
              No results
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
