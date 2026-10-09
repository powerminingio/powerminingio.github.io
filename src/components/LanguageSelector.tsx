import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const LanguageSelector = () => {
  const { i18n, t } = useTranslation();

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'it', label: 'Italiano' },
    { value: 'tlh', label: 'Klingon' },
    { value: 'pt', label: 'Portuguese' },
    { value: 'ru', label: 'Русский' },
    { value: 'tr', label: 'Türkçe' },
    { value: 'sk', label: 'Slovenský' },
    { value: 'ro', label: 'Română' }
  ];

  const handleLanguageChange = (value: string) => {
    i18n.changeLanguage(value);
  };

  const getCurrentLanguageLabel = () => {
    return languages.find(lang => lang.value === i18n.language)?.label || i18n.language;
  };

  return (
    <Select value={i18n.language} onValueChange={handleLanguageChange}>
      <SelectTrigger
        aria-label={t('common.language')}
        className="min-h-[38px] w-auto min-w-[8.5rem] rounded-pill border-transparent bg-transparent px-[17px] text-sm text-muted-foreground hover:bg-foreground/[.035] hover:text-foreground"
      >
        <SelectValue placeholder={getCurrentLanguageLabel()}>
          {getCurrentLanguageLabel()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {languages.map((lang) => (
          <SelectItem key={lang.value} value={lang.value}>
            {lang.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default LanguageSelector;
