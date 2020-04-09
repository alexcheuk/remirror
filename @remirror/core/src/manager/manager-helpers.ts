import { ErrorConstant, MarkGroup, NodeGroup, Tag } from '@remirror/core-constants';
import {
  entries,
  invariant,
  isEmptyArray,
  isFunction,
  isUndefined,
  object,
  sort,
} from '@remirror/core-helpers';
import { AnyFunction, DispatchFunction } from '@remirror/core-types';

import {
  AnyExtension,
  ExtensionListParameter,
  ExtensionTags,
  GetMarkNameUnion,
  GetNodeNameUnion,
  isExtension,
  isMarkExtension,
  isNodeExtension,
} from '../extension';
import { AnyPreset, isPreset } from '../preset';
import {
  CommandParameter,
  ExtensionCommandFunction,
  GeneralExtensionTags,
  GetConstructor,
  GetNameUnion,
  ManagerParameter,
  MarkExtensionTags,
  NodeExtensionTags,
} from '../types';

interface IsNameUniqueParameter {
  /**
   * The name to check against
   */
  name: string;

  /**
   * The set to check within
   */
  set: Set<string>;

  /**
   * Whether to throw when not unique
   *
   * @defaultValue `false`
   */
  shouldThrow?: boolean;

  /**
   * The type of the unique check
   *
   * @defaultValue 'extension'
   */
  type?: string;
}

/**
 * Checks whether a given string is unique to the set. Add the name if it
 * doesn't already exist, or throw an error when `shouldThrow` is true.
 *
 * @param params - destructured params
 */
const isNameUnique = ({
  name,
  set,
  shouldThrow = false,
  type = 'extension',
}: IsNameUniqueParameter) => {
  if (set.has(name)) {
    const message = `There is a naming conflict for the name: ${name} used in this type: ${type}. Please rename to avoid runtime errors.`;
    if (shouldThrow) {
      throw new Error(message);
    } else {
      console.error(message);
    }
  } else {
    set.add(name);
  }
};

interface TransformCommandsParameter<ExtensionUnion extends AnyExtension>
  extends ExtensionListParameter<ExtensionUnion> {
  /**
   * The command params which are passed to each extensions `commands` method.
   */
  params: CommandParameter;
}

/**
 * Get the params to which will be passed into the extension method call.
 *
 * @param extension - the extension to test.
 * @param params - the params without the type.
 */
const getParameterWithType = <
  ExtensionUnion extends AnyExtension,
  Parameter extends ManagerParameter
>(
  extension: ExtensionUnion,
  parameter: Parameter,
) => {
  if (isMarkExtension(extension)) {
    return { ...parameter, type: parameter.schema.marks[extension.name] };
  }

  if (isNodeExtension(extension)) {
    return { ...parameter, type: parameter.schema.nodes[extension.name] };
  }

  return parameter as any;
};

/**
 * Generate all the action commands for usage within the UI.
 *
 * Typically actions are used to create interactive menus. For example a menu
 * can use a command to toggle bold formatting or to undo the last action.
 */
const transformCommands = <ExtensionUnion extends AnyExtension>({
  extensions,
  params,
}: TransformCommandsParameter<ExtensionUnion>) => {
  const unchained: Record<
    string,
    { command: AnyFunction; isEnabled: AnyFunction; name: string }
  > = object();

  const chained: Record<string, any> = object();

  const names = new Set<string>();

  const { view, getState } = params;

  const unchainedFactory = ({
    command,
    shouldDispatch = true,
  }: {
    command: ExtensionCommandFunction;
    shouldDispatch?: boolean;
  }) => (...spread: unknown[]) => {
    let dispatch: DispatchFunction | undefined = undefined;

    if (shouldDispatch) {
      dispatch = view.dispatch;
      view.focus(); // TODO should this be configurable?
    }

    return command(...spread)({ state: getState(), dispatch, view });
  };

  const chainedFactory = (command: ExtensionCommandFunction) => (...spread: unknown[]) => {
    const state = getState();
    const dispatch: DispatchFunction = (transaction) => {
      invariant(transaction === state.tr, {
        message:
          'Chaining currently only supports methods which do not clone the transaction object.',
      });
    };

    command(...spread)({ state, dispatch, view });

    return chained;
  };

  const getItemParameters = (extension: ExtensionUnion) =>
    extension.parameter.createCommands?.(getParameterWithType(extension, params), extension);

  for (const extension of extensions) {
    if (extension.parameter.createCommands) {
      continue;
    }

    const item = getItemParameters(extension);

    for (const [name, command] of entries(item)) {
      isNameUnique({ name, set: names, shouldThrow: true });

      unchained[name] = {
        name: extension.name,
        command: unchainedFactory({ command }),
        isEnabled: unchainedFactory({ command, shouldDispatch: false }),
      };

      chained[name] = chainedFactory(command);
    }
  }

  return { unchained, chained };
};

// /**
//  * Generate all the helpers from the extension list.
//  *
//  * Helpers are functions which enable extensions to provide useful information
//  * or transformations to their consumers and other extensions.
//  */
// const createHelpers = ({ extensions, params }: CreateHelpersParameter) => {
//   const getItemParameters = (extension: Required<Pick<AnyExtension, 'helpers'>>) =>
//     extension.helpers({
//       ...params,
//       ...getParameterWithType(extension, params),
//     });

//   const items: Record<string, AnyFunction> = object();
//   const names = new Set<string>();

//   extensions.filter(hasExtensionProperty('helpers')).forEach((currentExtension) => {
//     const item = getItemParameters(currentExtension);

//     Object.entries(item).forEach(([name, helper]) => {
//       isNameUnique({ name, set: names, shouldThrow: true });

//       items[name] = helper;
//     });
//   });

//   return items;
// };

interface TransformExtensionOrPreset<
  ExtensionUnion extends AnyExtension,
  PresetUnion extends AnyPreset<ExtensionUnion>
> {
  extensions: ExtensionUnion[];
  extensionMap: WeakMap<GetConstructor<ExtensionUnion>, ExtensionUnion>;
  presets: PresetUnion[];
  presetMap: WeakMap<GetConstructor<PresetUnion>, PresetUnion>;
}

/**
 * Transforms the unsorted array of presets and extension into presets and
 * sorted extensions. Handles uniqueness of extensions and automatically pulling
 * in required extensions.
 *
 * TODO Add a check for requiredExtensions and inject them automatically
 * TODO Currently matching by constructor - what if different versions exist in
 * the same app...
 *
 * @param unionValues - the extensions to transform as well as their priorities
 *
 * @returns the list of extension instances sorted by priority
 */
const transformExtensionOrPreset = <
  ExtensionUnion extends AnyExtension,
  PresetUnion extends AnyPreset<ExtensionUnion>
>(
  unionValues: Array<ExtensionUnion | PresetUnion>,
): TransformExtensionOrPreset<ExtensionUnion, PresetUnion> => {
  type ExtensionConstructor = GetConstructor<ExtensionUnion>;
  type PresetConstructor = GetConstructor<PresetUnion>;
  interface MissingConstructor {
    Constructor: ExtensionConstructor;
    extension: ExtensionUnion;
  }

  // The items to return.
  const presets = [] as PresetUnion[];
  const extensionMap = new WeakMap<ExtensionConstructor, ExtensionUnion>();
  const presetMap = new WeakMap<PresetConstructor, PresetUnion>();
  const extensions = [] as ExtensionUnion[];

  // Used to check track duplicates and the presets they've been added by.
  const duplicateMap = new WeakMap<ExtensionConstructor, Array<PresetUnion | undefined>>();

  // The extensions
  let rawExtensions = [] as ExtensionUnion[];

  /**
   * Adds the values to the duplicate map for checking duplicates.
   */
  const updateDuplicateMap = (extension: ExtensionUnion, preset?: PresetUnion) => {
    const key = extension.constructor;
    const duplicate = duplicateMap.get(key);
    duplicateMap.set(key, duplicate ? [...duplicate, preset] : [preset]);
  };

  for (const presetOrExtension of unionValues) {
    // Update the extension list in this block
    if (isExtension(presetOrExtension)) {
      rawExtensions.push(presetOrExtension);
      updateDuplicateMap(presetOrExtension);

      continue;
    }

    // Update the presets list in this block
    if (isPreset(presetOrExtension)) {
      presets.push(presetOrExtension);
      rawExtensions.push(...presetOrExtension.extensions);
      presetMap.set(presetOrExtension.constructor, presetOrExtension);

      presetOrExtension.extensions.forEach((extension) =>
        updateDuplicateMap(extension, presetOrExtension),
      );

      continue;
    }

    // This is only reached if the passed value is invalid.
    invariant(false, { code: ErrorConstant.INVALID_MANAGER_ARGUMENTS });
  }

  // Sort the extensions.
  rawExtensions = sort(rawExtensions, (a, b) => a.priority - b.priority);

  // Keep track of added constructors for uniqueness.
  const found = new WeakSet<ExtensionConstructor>();

  // Remove extension duplicates and update the preset with the non duplicated
  // value.
  for (const extension of rawExtensions) {
    const key = extension.constructor;
    const duplicates = duplicateMap.get(key);

    invariant(duplicates, {
      message: `No entries where found for the ExtensionConstructor ${extension.name}`,
      code: ErrorConstant.INTERNAL,
    });

    if (found.has(key)) {
      continue;
    }

    found.add(key);
    extensions.push(extension);

    // Replace the extensions for all presets that referenced this constructor.
    duplicates.forEach((preset) => preset?.replaceExtension(key, extension));
  }

  const missing: MissingConstructor[] = [];

  /**
   * Populate the missing Constructors.
   */
  const findMissingExtensions = (extension: ExtensionUnion) => {
    for (const Constructor of extension.requiredExtensions) {
      if (found.has(Constructor)) {
        continue;
      }

      missing.push({ Constructor, extension });
    }
    extension.requiredExtensions.every((Constructor) => found.has(Constructor));
  };

  // Throw if any required extension missing.
  for (const extension of extensions) {
    findMissingExtensions(extension);
  }

  invariant(isEmptyArray(missing), {
    code: ErrorConstant.MISSING_REQUIRED_EXTENSION,
    message: missing
      .map(
        ({ Constructor, extension }) =>
          `The extension '${extension.name}' requires '${Constructor.extensionName} in order to run correctly.`,
      )
      .join('\n'),
  });

  return {
    extensions: rawExtensions,
    extensionMap,
    presets,
    presetMap,
  };
};

/**
 * Takes in an object and removes all function values.
 *
 * @remarks
 * This is useful for deep equality checks when functions need to be ignored.
 *
 * A current limitation is that it only dives one level deep. So objects with
 * nested object methods will retain those methods.
 *
 * @param obj - an object which might contain methods
 * @returns a new object without any of the functions defined
 */
const ignoreFunctions = (object_: Record<string, unknown>) => {
  const newObject: Record<string, unknown> = object();
  for (const key of Object.keys(object_)) {
    if (isFunction(object_[key])) {
      continue;
    }
    newObject[key] = object_[key];
  }

  return newObject;
};

/**
 * Create the extension tags which are passed into each extensions method to
 * enable dynamically generated rules and commands.
 */
const createExtensionTags = <ExtensionUnion extends AnyExtension>(
  extensions: readonly ExtensionUnion[],
): ExtensionTags<ExtensionUnion> => {
  type MarkNames = GetMarkNameUnion<ExtensionUnion>;
  type NodeNames = GetNodeNameUnion<ExtensionUnion>;
  type AllNames = GetNameUnion<ExtensionUnion>;

  const general: GeneralExtensionTags<AllNames> = {
    [Tag.FormattingMark]: [],
    [Tag.FormattingNode]: [],
    [Tag.LastNodeCompatible]: [],
    [Tag.NodeCursor]: [],
  };

  const mark: MarkExtensionTags<MarkNames> = {
    [MarkGroup.Alignment]: [],
    [MarkGroup.Behavior]: [],
    [MarkGroup.Color]: [],
    [MarkGroup.FontStyle]: [],
    [MarkGroup.Indentation]: [],
    [MarkGroup.Link]: [],
    [MarkGroup.Code]: [],
  };

  const node: NodeExtensionTags<NodeNames> = {
    [NodeGroup.Block]: [],
    [NodeGroup.Inline]: [],
  };

  for (const extension of extensions) {
    if (isNodeExtension(extension)) {
      const group = extension.schema.group as NodeGroup;
      const name = extension.name as NodeNames;

      node[group] = isUndefined(node[group]) ? [name] : [...node[group], name];
    }

    if (isMarkExtension(extension)) {
      const group = extension.schema.group as MarkGroup;
      const name = extension.name as MarkNames;

      mark[group] = isUndefined(mark[group]) ? [name] : [...mark[group], name];
    }

    for (const tag of extension.tags as Tag[]) {
      general[tag] = isUndefined(general[tag])
        ? [extension.name]
        : [...general[tag], extension.name];
    }
  }

  return {
    general,
    mark,
    node,
  };
};

/**
 * Identifies the stage the extension manager is at.
 */
enum ManagerPhase {
  /**
   * When the extension manager is being created.
   */
  None,

  /**
   * When the extension manager is being initialized. This is when the
   * onInitialize methods are being called.
   */
  Initialize,

  /**
   * When the view is being added and all onViewAdded methods are being called.
   */
  AddView,

  /**
   * The phases of creating this manager are completed.
   */
  Done,
}

export {
  transformCommands,
  createExtensionTags,
  // createHelpers,
  getParameterWithType,
  ignoreFunctions,
  ManagerPhase,
  transformExtensionOrPreset,
  TransformExtensionOrPreset,
};