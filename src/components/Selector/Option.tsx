import { type UseInteractionsReturn, useListItem } from '@floating-ui/react';
import { type PropsWithChildren } from 'react';

import toolbarStyles from '../../Toolbar.module.css';

interface Props {
  activeIndex: number | null;
  selectedIndex: number;
  getItemProps: UseInteractionsReturn['getItemProps'];
  onSelect: (index: number) => void;
}

function Option(props: PropsWithChildren<Props>) {
  const { activeIndex, selectedIndex, children, getItemProps, onSelect } =
    props;
  const { ref, index } = useListItem();

  return (
    <button
      ref={ref}
      className={toolbarStyles.btnOption}
      type="button"
      role="option"
      aria-selected={index === selectedIndex || undefined}
      tabIndex={index === activeIndex ? 0 : -1}
      data-active={index === activeIndex || undefined}
      {...getItemProps({ onClick: () => onSelect(index) })}
    >
      {children}
    </button>
  );
}

export default Option;
