/** Public, so the app stores can link it too (public/privacy.html). */
export const PRIVACY_URL = 'https://www.flightplanningtool.com/privacy.html';

const CompanyFooter: React.FC = () => {
  return (
    <div className="mt-8 text-center text-sm text-muted-foreground">
      <p>
                Created by{' '}
        <a
          href="https://songerconsulting.se"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
                    Songer Consulting AB
        </a>
        {' · '}
        <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">
          Privacy
        </a>
      </p>
    </div>
  );
};

export default CompanyFooter;