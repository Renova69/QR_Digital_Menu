import { stripBrandingFields, BRANDING_FIELDS } from './branding-fields';

describe('branding-fields', () => {
  describe('stripBrandingFields', () => {
    it('should remove branding fields from a given object', () => {
      const dto = {
        name: 'My Restaurant',
        logoUrl: 'http://example.com/logo.png',
        accentColor: '#FF0000',
        defaultTheme: 'light',
        socialFacebookUrl: 'http://facebook.com/myrestaurant', // Should not be removed
      };

      const result = stripBrandingFields(dto);

      expect(result).toEqual({
        name: 'My Restaurant',
        socialFacebookUrl: 'http://facebook.com/myrestaurant',
      });
      expect(result).not.toHaveProperty('logoUrl');
      expect(result).not.toHaveProperty('accentColor');
      expect(result).not.toHaveProperty('defaultTheme');
    });

    it('should not mutate the original object', () => {
      const dto = {
        name: 'My Restaurant',
        logoUrl: 'http://example.com/logo.png',
      };

      const dtoCopy = { ...dto };
      stripBrandingFields(dto);

      expect(dto).toEqual(dtoCopy); // The original should remain unchanged
    });

    it('should return a new object with all branding fields omitted if they are all present', () => {
      const dto = BRANDING_FIELDS.reduce(
        (acc, field) => {
          acc[field] = 'some-value';
          return acc;
        },
        {} as Record<string, string>,
      );
      dto.otherField = 'keep me';

      const result = stripBrandingFields(dto);
      expect(result).toEqual({ otherField: 'keep me' });
    });
  });
});
