import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { joinClassNames } from "../classNames";
import { useMenuController } from "../../../app/hooks/useMenuController";

type PopoverSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

export const PopoverSurface = forwardRef<HTMLDivElement, PopoverSurfaceProps>(
  function PopoverSurface({ className, ...props }, ref) {
    return <div ref={ref} className={joinClassNames("ds-popover", className)} {...props} />;
  },
);

type PopoverMenuItemProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
};

export function PopoverMenuItem({
  className,
  icon,
  active = false,
  children,
  ...props
}: PopoverMenuItemProps) {
  return (
    <button
      type="button"
      className={joinClassNames("ds-popover-item", active && "is-active", className)}
      {...props}
    >
      {icon ? (
        <span className="ds-popover-item-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="ds-popover-item-label">{children}</span>
    </button>
  );
}

type MenuTriggerProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "aria-expanded" | "aria-haspopup"
> & {
  isOpen: boolean;
  popupRole?: "menu" | "dialog";
  activeClassName?: string;
  "data-tauri-drag-region"?: string;
};

export function MenuTrigger({
  isOpen,
  popupRole = "menu",
  className,
  activeClassName,
  "data-tauri-drag-region": dragRegion,
  ...props
}: MenuTriggerProps) {
  return (
    <button
      type="button"
      aria-haspopup={popupRole}
      aria-expanded={isOpen}
      className={joinClassNames(className, isOpen && activeClassName)}
      data-tauri-drag-region={dragRegion ?? "false"}
      {...props}
    />
  );
}

type SplitActionMenuProps = {
  containerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  buttonGroupClassName?: string;
  actionButton: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  toggleClassName?: string;
  toggleAriaLabel: string;
  toggleTitle?: string;
  toggleTooltip?: string;
  toggleTooltipPlacement?: "top" | "bottom";
  toggleTooltipAlign?: "start" | "end";
  toggleIcon: ReactNode;
  popoverClassName?: string;
  popoverRole?: "menu" | "dialog";
  children: ReactNode;
};

export function SplitActionMenu({
  containerRef,
  className,
  buttonGroupClassName,
  actionButton,
  isOpen,
  onToggle,
  toggleClassName,
  toggleAriaLabel,
  toggleTitle,
  toggleTooltip,
  toggleTooltipPlacement,
  toggleTooltipAlign,
  toggleIcon,
  popoverClassName,
  popoverRole = "menu",
  children,
}: SplitActionMenuProps) {
  return (
    <div className={className} ref={containerRef}>
      <div className={buttonGroupClassName}>
        {actionButton}
        <MenuTrigger
          isOpen={isOpen}
          popupRole={popoverRole}
          className={toggleClassName}
          onClick={onToggle}
          aria-label={toggleAriaLabel}
          title={toggleTitle}
          data-tooltip={toggleTooltip}
          data-tooltip-placement={toggleTooltipPlacement}
          data-tooltip-align={toggleTooltipAlign}
        >
          {toggleIcon}
        </MenuTrigger>
      </div>
      {isOpen && (
        <PopoverSurface className={popoverClassName} role={popoverRole}>
          {children}
        </PopoverSurface>
      )}
    </div>
  );
}

export type SelectMenuOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  description?: ReactNode;
};

type SelectMenuProps<T extends string> = {
  value: T | undefined;
  onChange: (value: T) => void;
  options: SelectMenuOption<T>[];
  ariaLabel: string;
  placeholder?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
  buttonClassName?: string;
  popoverClassName?: string;
  size?: "sm" | "md";
  align?: "start" | "end" | "auto";
  placement?: "bottom" | "top";
  fullWidth?: boolean;
  hideCaret?: boolean;
  unstyledTrigger?: boolean;
  style?: CSSProperties;
  buttonStyle?: CSSProperties;
  anchorClassName?: string;
  renderTrigger?: (option: SelectMenuOption<T> | undefined) => ReactNode;
};

export function SelectMenu<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  disabled,
  id,
  className,
  buttonClassName,
  popoverClassName,
  size = "md",
  align = "auto",
  placement = "bottom",
  fullWidth = false,
  hideCaret = false,
  unstyledTrigger = false,
  style,
  buttonStyle,
  anchorClassName,
  renderTrigger,
}: SelectMenuProps<T>) {
  const menu = useMenuController();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});

  const updatePosition = () => {
    const button = triggerRef.current;
    if (!button) return;
    const anchor = anchorClassName
      ? button.closest(`.${anchorClassName}`) ?? button
      : button;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const distanceFromRight = viewportWidth - rect.right;
    const resolvedAlign: "start" | "end" =
      align === "start" || align === "end"
        ? align
        : rect.left > distanceFromRight
          ? "end"
          : "start";
    const horizontal: CSSProperties =
      resolvedAlign === "end"
        ? { right: Math.max(8, viewportWidth - rect.right), left: "auto" }
        : { left: Math.max(8, rect.left), right: "auto" };
    const vertical: CSSProperties =
      placement === "top"
        ? { bottom: viewportHeight - rect.top + 6, top: "auto" }
        : { top: rect.bottom + 6, bottom: "auto" };
    setPopoverStyle({
      position: "fixed",
      width: "max-content",
      minWidth: rect.width,
      maxWidth: `min(420px, calc(100vw - 16px))`,
      ...horizontal,
      ...vertical,
    });
  };

  useLayoutEffect(() => {
    if (!menu.isOpen) return;
    updatePosition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.isOpen, align, placement, anchorClassName]);

  useEffect(() => {
    if (!menu.isOpen) return;
    const handle = () => updatePosition();
    window.addEventListener("resize", handle);
    window.addEventListener("scroll", handle, true);
    return () => {
      window.removeEventListener("resize", handle);
      window.removeEventListener("scroll", handle, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.isOpen]);

  const selected = options.find((option) => option.value === value);
  const handleSelect = (option: SelectMenuOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    menu.close();
  };
  return (
    <div
      ref={menu.containerRef}
      style={style}
      className={joinClassNames(
        "select-menu",
        fullWidth && "select-menu-full",
        className,
      )}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        style={buttonStyle}
        className={joinClassNames(
          !unstyledTrigger && "select-menu-trigger",
          !unstyledTrigger && size === "sm" && "select-menu-trigger-sm",
          menu.isOpen && "is-open",
          buttonClassName,
        )}
        aria-haspopup="listbox"
        aria-expanded={menu.isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={menu.toggle}
        data-tauri-drag-region="false"
      >
        <span className="select-menu-value">
          {renderTrigger
            ? renderTrigger(selected)
            : selected
              ? (
                  <>
                    {selected.icon ? (
                      <span className="select-menu-icon" aria-hidden>
                        {selected.icon}
                      </span>
                    ) : null}
                    <span className="select-menu-label">{selected.label}</span>
                  </>
                )
              : (
                  <span className="select-menu-placeholder">
                    {placeholder ?? "Select…"}
                  </span>
                )}
        </span>
        {!hideCaret && (
          <ChevronDown size={14} aria-hidden className="select-menu-caret" />
        )}
      </button>
      {menu.isOpen && createPortal(
        <PopoverSurface
          ref={popoverRef}
          style={popoverStyle}
          onMouseDown={(event) => event.stopPropagation()}
          className={joinClassNames(
            "select-menu-popover",
            "select-menu-popover-portal",
            popoverClassName,
          )}
          role="listbox"
        >
          {options.map((option) => (
            <PopoverMenuItem
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              active={option.value === value}
              disabled={option.disabled}
              icon={option.icon}
              onClick={() => handleSelect(option)}
              data-tauri-drag-region="false"
            >
              {option.description ? (
                <span className="select-menu-option-text">
                  <span className="select-menu-option-label">{option.label}</span>
                  <span className="select-menu-option-description">
                    {option.description}
                  </span>
                </span>
              ) : (
                option.label
              )}
            </PopoverMenuItem>
          ))}
        </PopoverSurface>,
        document.body,
      )}
    </div>
  );
}
