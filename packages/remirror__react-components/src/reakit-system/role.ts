import { cx } from '@linaria/core';
import { RoleHTMLProps } from 'reakit/Role/Role';
import { PaletteRoleOptions } from 'reakit-system-palette/Role';
import { ComponentsTheme } from '@remirror/theme';

export type BootstrapRoleOptions = PaletteRoleOptions;

export function useRoleProps(
  _: BootstrapRoleOptions,
  htmlProps: RoleHTMLProps = {},
): RoleHTMLProps {
  return { ...htmlProps, className: cx(ComponentsTheme.ROLE, htmlProps.className) };
}
