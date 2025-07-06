import React from 'react';
import { classNames } from '@/utils/formatUtils';

interface FormattedDescriptionProps {
  description: string | null | undefined;
  className?: string;
}

export const FormattedDescription: React.FC<FormattedDescriptionProps> = ({ 
  description, 
  className 
}) => {
  if (!description) return null;
  
  // Einfache URL-Erkennung (http, https, ftp, www)
  const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/g;
  
  // Text nach Zeilenumbrüchen aufteilen
  const lines = description.split('\n');
  
  return (
    <div className={classNames("space-y-1", className || "")}>
      {lines.map((line, lineIndex) => {
        // Wenn die Zeile leer ist, einen Abstand einfügen
        if (!line.trim()) {
          return <div key={`line-${lineIndex}`} className="h-2" />;
        }
        
        // Links im Text finden
        const parts: (string | JSX.Element)[] = [];
        let lastIndex = 0;
        
        // Sammelt Text und Links in einem Array
        line.replace(urlRegex, (url, withProtocol, withWWW, offset) => {
          // Text vor dem Link hinzufügen
          if (offset > lastIndex) {
            parts.push(line.substring(lastIndex, offset));
          }
          
          // URL mit passendem Protokoll erstellen
          const href = withProtocol ? url : `http://${url}`;
          
          // Link-Element hinzufügen
          parts.push(
            <a 
              key={`${lineIndex}-link-${offset}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline"
            >
              {url}
            </a>
          );
          
          lastIndex = offset + url.length;
          return url; // Wird nur für replace benötigt
        });
        
        // Restlichen Text nach dem letzten Link hinzufügen
        if (lastIndex < line.length) {
          parts.push(line.substring(lastIndex));
        }
        
        // Zeile mit Text und Links rendern
        return (
          <p key={`line-${lineIndex}`} className="text-base text-gray-300">
            {parts.length > 0 ? parts : line}
          </p>
        );
      })}
    </div>
  );
}; 