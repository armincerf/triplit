import {
  CollectionAttributeDefinition,
  AttributeDefinition,
  Model,
} from '@triplit/db';
import { useEffect, useMemo, useState } from 'react';

import { useForm } from '@mantine/form';
import {
  CollectionDefinition,
  CollectionTypeKeys,
  RecordAttributeDefinition,
  ValueTypeKeys,
} from '@triplit/db/src/data-types/serialization.js';
import { Collection } from '@triplit/db/src/schema.js';
import {
  SetInput,
  Button,
  Input,
  Select,
  CloseButton,
  FormField,
  Combobox,
  Textarea,
  Checkbox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Code,
} from '@triplit/ui';
import { TriplitClient } from '@triplit/client';
import { Plus } from 'lucide-react';
import { nanoid } from 'nanoid';
import { flattenSchema } from 'src/utils/flatten-schema.js';

interface FormValues {
  id: string;
  attributes: {
    fieldName: string;
    definition: AttributeDefinition;
    fieldValue: string | Set<any>;
    key: string;
  }[];
}

/**
 * Convert string values to Triplit values as needed
 */
function convertFormValueToTriplitValue(
  value: string | Record<string, any> | null | undefined,
  definition: AttributeDefinition
): any {
  // If we have a default function, let DB handle and return undefined
  const hasDefaultFunction = !!definition?.options?.default?.func;
  if (hasDefaultFunction && value == undefined) return undefined;

  // Undefined and null are valid triplit values (for inputs)
  if (value === undefined) return undefined;
  if (value === null) return null;

  // Convert strings to booleans
  if (definition.type === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }

  // Convert strings to numbers
  if (definition.type === 'number') {
    const num = Number(value);
    if (isNaN(num)) return undefined;
    return num;
  }

  // Convert strings to dates
  if (definition.type === 'date') {
    const val = new Date(value);
    if (String(val) === 'Invalid Date') return undefined;
    return val;
  }

  // recurse in records
  if (definition.type === 'record')
    return Object.fromEntries(
      Object.entries(value).map(([name, value]) => [
        name,
        convertFormValueToTriplitValue(value, definition.properties[name]),
      ])
    );
  return value;
}

function convertFormToEntity(attributes: FormValues['attributes']) {
  const entity: any = {};
  attributes.forEach((attr) => {
    const { definition, fieldValue, fieldName } = attr;
    const triplitValue = convertFormValueToTriplitValue(fieldValue, definition);
    if (triplitValue === undefined) return;
    const path = fieldName.split('.');
    let current = entity;
    while (path.length > 1) {
      const key = path.shift();
      if (!current[key]) current[key] = {};
      current = current[key];
    }
    current[path[0]] = triplitValue;
  });
  return entity;
}

function initializeNewEntityForm(
  collection?: CollectionDefinition
): FormValues {
  if (!collection || !collection?.schema?.properties)
    return { id: '', attributes: [] };
  const attributes = (
    Object.entries(collection.schema.properties) as [
      string,
      Exclude<AttributeDefinition, RecordAttributeDefinition>
    ][]
  )
    .filter(
      ([_attr, definition]) => definition.type !== 'query' && _attr !== 'id'
    )
    .map(([attr, definition]) => {
      return {
        definition,
        fieldName: attr,
        fieldValue: undefined,
        key: attr,
      };
    });
  return { id: '', attributes };
}

function TypeLabel({
  name,
  type,
  setItemsType,
  isEnum = false,
}: {
  name: string;
  type: ValueTypeKeys | CollectionTypeKeys;
  setItemsType?: ValueTypeKeys;
  isEnum?: boolean;
}) {
  return (
    <div className="flex flex-row gap-2 items-center w-full">
      {name}
      {
        <div className="text-xs text-zinc-500">
          {`${type}`}
          {setItemsType && (
            <span className="text-blue-800">
              {'<'}
              <span className="text-zinc-500">{setItemsType}</span>
              {'>'}
            </span>
          )}
          {isEnum && ' (enum)'}
        </div>
      }
    </div>
  );
}

export function CreateEntitySheet({
  collection,
  inferredAttributes,
  collectionSchema,
  client,
}: {
  collection: string;
  inferredAttributes?: string[];
  collectionSchema?: Collection<any>;
  client: TriplitClient<any>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({
    initialValues: initializeNewEntityForm(collectionSchema),
  });

  useEffect(() => {
    form.setValues(initializeNewEntityForm(collectionSchema));
  }, [collectionSchema]);

  const [customAttributes, setCustomAttributes] = useState<string[]>([]);
  const allAttributes = useMemo(
    () => [
      ...(inferredAttributes ? inferredAttributes : []),
      ...customAttributes,
    ],
    [inferredAttributes, customAttributes]
  );
  const unselectedAttributes = useMemo(() => {
    if (allAttributes.length === 0 || collectionSchema) return [];
    return allAttributes.filter(
      (attr) => !form.values.attributes.find((item) => item.fieldName === attr)
    );
  }, [form.values.attributes, collectionSchema, allAttributes]);

  const optionalAttributes = new Set(collectionSchema?.schema?.optional ?? []);
  const allFields =
    // useMemo(
    //   () =>
    form.values.attributes.map((item, index) => {
      const hasDefault = item.definition?.options?.default !== undefined;
      const isRequired =
        !hasDefault &&
        !optionalAttributes.has(item.fieldName) &&
        (!item.definition?.options?.nullable || item.fieldValue !== null);
      const isEnum = item.definition?.options?.enum;
      return (
        <div
          key={item.key}
          className={`flex w-full flex-row ${
            collectionSchema ? 'items-center' : 'items-start'
          } gap-2`}
        >
          {!collectionSchema && (
            <>
              <Combobox
                placeholder="Add an attribute..."
                className="w-[37.5%]"
                data={unselectedAttributes.concat(
                  item.fieldName ? [item.fieldName] : []
                )}
                onAddValue={(query) => {
                  setCustomAttributes((prev) => [...prev, query]);
                  return query;
                }}
                value={item.fieldName}
                onChangeValue={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldName`, value);
                }}
              />
              <Select
                className="w-1/4"
                data={['string', 'boolean', 'number']}
                value={item.definition.type}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.definition`, {
                    value,
                  });
                }}
              />
            </>
          )}
          <FormField
            label={
              collectionSchema && (
                <TypeLabel
                  name={item.fieldName}
                  type={item.definition.type}
                  setItemsType={
                    item.definition.type === 'set'
                      ? item.definition.items.type
                      : undefined
                  }
                  isEnum={isEnum}
                />
              )
            }
          >
            {item.definition.type === 'string' && isEnum && (
              <Select
                required={isRequired}
                data={item.definition.options.enum}
                disabled={item.fieldValue === null}
                value={item.fieldValue ?? ''}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
              />
            )}
            {item.definition.type === 'string' && !isEnum && (
              <Textarea
                required={isRequired}
                disabled={item.fieldValue === null}
                value={item.fieldValue ?? ''}
                onChange={(e) => {
                  form.setFieldValue(
                    `attributes.${index}.fieldValue`,
                    e.target.value
                  );
                }}
              />
            )}
            {item.definition.type === 'number' && (
              <Input
                type="number"
                required={isRequired}
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.definition.type === 'date' && (
              <Input
                type="datetime-local"
                required={isRequired}
                disabled={item.fieldValue === null}
                {...form.getInputProps(`attributes.${index}.fieldValue`)}
              />
            )}
            {item.definition.type === 'boolean' && (
              <Select
                disabled={item.fieldValue === null}
                required={isRequired}
                data={['true', 'false']}
                value={item.fieldValue}
                onValueChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
              />
            )}
            {item.definition.type === 'set' && (
              <SetInput
                value={form.values.attributes[index].fieldValue}
                onChange={(value) => {
                  form.setFieldValue(`attributes.${index}.fieldValue`, value);
                }}
                renderItem={
                  item.definition.items.type === 'date'
                    ? (date: Date) => date.toISOString()
                    : undefined
                }
                parse={PARSE_FUNCS[item.definition.items.type]}
              />
            )}
            {item.definition.type === 'record' &&
              Object.entries(item.definition.properties).map(
                ([name, definition]) => (
                  <div className="flex flex-row gap-2" key={name}>
                    <div className="ml-10 w-1/4">
                      <TypeLabel
                        name={name}
                        type={item.definition.properties[name].type}
                      />
                    </div>
                    {definition.type === 'string' && (
                      <Textarea
                        key={name}
                        required
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}
                    {definition.type === 'number' && (
                      <Input
                        type="number"
                        required
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}
                    {definition.type === 'date' && (
                      <Input
                        type="datetime-local"
                        required
                        disabled={item.fieldValue === null}
                        {...form.getInputProps(
                          `attributes.${index}.fieldValue.${name}`
                        )}
                      />
                    )}

                    {definition.type === 'boolean' && (
                      <Select
                        required
                        disabled={item.fieldValue === null}
                        data={['true', 'false']}
                        value={item.fieldValue[name]}
                        onValueChange={(value) => {
                          form.setFieldValue(
                            `attributes.${index}.fieldValue.${name}`,
                            value
                          );
                        }}
                      />
                    )}
                  </div>
                )
              )}
            {item?.definition?.options?.default?.func && (
              <div className="text-muted-foreground">{`Default: ${item?.definition?.options?.default?.func}()`}</div>
            )}
          </FormField>
          {(item.definition?.options?.nullable || !collectionSchema) && (
            <div className="flex flex-col gap-2 self-end items-center mb-[10px]">
              <p className="text-sm mb-2">Null?</p>
              <Checkbox
                className="h-[20px] w-[20px]"
                checked={item.fieldValue === null}
                onCheckedChange={(checked) => {
                  checked
                    ? form.setFieldValue(`attributes.${index}.fieldValue`, null)
                    : form.setFieldValue(`attributes.${index}.fieldValue`, '');
                }}
              />
            </div>
          )}
          {!collectionSchema && (
            <CloseButton
              onClick={() => form.removeListItem('attributes', index)}
            />
          )}
        </div>
      );
    });

  const [requiredFields, optionalFields] = allFields.reduce(
    ([req, opt], field) => {
      if (optionalAttributes.has(field.key)) return [req, opt.concat([field])];
      return [req.concat([field]), opt];
    },
    [[], []]
  ); //     ,
  //   [
  //     form,
  //     collectionDefinition,
  //     inferredAttributes,
  //     unselectedAttributes,
  //     customAttributes,
  //   ]
  // );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size={'sm'}
          variant={'secondary'}
          className="bg-green-200 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900 dark:text-green-400 gap-1 py-1 h-auto"
        >
          <Plus className="h-4 w-4" />
          Insert
        </Button>
      </SheetTrigger>
      <SheetContent className="text-sm sm:max-w-[40%] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Insert entity</SheetTitle>
          <SheetDescription>
            Create a new entity in <Code>{collection}</Code>
          </SheetDescription>
        </SheetHeader>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              let entity = convertFormToEntity(form.values.attributes);
              if (form.values.id)
                entity = Object.assign(entity, { id: form.values.id });

              await client.insert(collection, entity);
              form.reset();
              setOpen(false);
            } catch (e) {
              console.error(e);
            }
          }}
          className="flex flex-col gap-10 mt-8"
        >
          <FormField label="id" description="The primary key for this entity">
            <Input
              placeholder="auto-generate (leave blank)"
              {...form.getInputProps('id')}
            />
          </FormField>
          {!collectionSchema && <div className="text-xs -mb-3">Attributes</div>}
          {requiredFields}
          {optionalFields.length > 0 && (
            <>
              <div className="border-t w-full" />
              <div className="">
                <SheetTitle className="mb-2">Optional attributes</SheetTitle>
                <SheetDescription>
                  These attributes will be undefined if not provided.
                </SheetDescription>
              </div>
              {optionalFields}
            </>
          )}
          {!collectionSchema && (
            <Button
              variant={'default'}
              type="button"
              onClick={() => {
                form.insertListItem('attributes', {
                  fieldName:
                    unselectedAttributes.length > 0
                      ? unselectedAttributes[0]
                      : '',
                  definition: { type: 'string' },
                  fieldValue: '',
                  key: nanoid(),
                });
              }}
            >
              Add attribute
            </Button>
          )}
          <SheetFooter>
            {/* todo update so that onClose clears state */}
            <Button
              type="button"
              onClick={() => setOpen(false)}
              variant="outline"
            >
              Cancel
            </Button>
            <Button type="submit">Create</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function parseDate(value: string) {
  const val = new Date(value);
  if (String(val) === 'Invalid Date') throw new Error('Invalid Date');
  return val;
}

function parseNumber(value: string) {
  const val = Number(value);
  if (isNaN(val)) throw new Error('Invalid Number');
  return val;
}

function parseBoolean(value: string) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error('Invalid Boolean');
}

export const PARSE_FUNCS = {
  date: parseDate,
  number: parseNumber,
  boolean: parseBoolean,
};
