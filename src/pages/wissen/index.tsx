import React, { useEffect } from 'react';
import { LexikonLayout } from '@/components/layout/LexikonLayout';
import Link from 'next/link';
import { ChevronRight, BookOpen, Users, Trophy, Zap, Scale, FileText } from 'lucide-react';
import { SearchBar } from '@/components/wissen/SearchBar';
import { SeoHead } from '@/components/layout/SeoHead';

const WissenHomePage = () => {
    const breadcrumbItems = [{ name: 'Jass-Wiki', href: '/wissen' }];

    // Enable scrolling for knowledge pages
    useEffect(() => {
        // Add class to enable scrolling
        document.body.classList.add('lexikon-page');
        
        // Cleanup: Remove class when component unmounts
        return () => {
            document.body.classList.remove('lexikon-page');
        };
    }, []);

    const categories = [
        { 
            slug: 'regeln', 
            name: 'Regeln',
            description: 'Alle offiziellen Spielregeln, Sonderregeln und Ausnahmefälle im Detail',
            icon: Scale,
            color: 'bg-red-500' // Rot - höchste Priorität
        },
        { 
            slug: 'weis-regeln', 
            name: 'Weis-Regeln',
            description: 'Alles über Weis, Stöck und Punktezählung - werde zum Weis-Experten',
            icon: Trophy,
            color: 'bg-orange-500' // Orange - zweithöchste Priorität
        },
        { 
            slug: 'geschichte', 
            name: 'Geschichte',
            description: 'Wie entstand das Jassen? Erfahre alles über die Wurzeln des Schweizer Nationalspiel',
            icon: BookOpen,
            color: 'bg-amber-500' // Gelb - warme Farbe
        },
        { 
            slug: 'grundlagen-kultur', 
            name: 'Grundlagen & Kultur',
            description: 'Kartenwerte, Spielablauf und die kulturelle Bedeutung des Jassens in der Schweiz',
            icon: Users,
            color: 'bg-green-500' // Grün - natürliche Farbe
        },
        { 
            slug: 'schieber', 
            name: 'Schieber',
            description: 'Die beliebteste Jassvariante im Detail - Regeln, Strategien und Tipps',
            icon: Zap,
            color: 'bg-blue-500' // Blau - kühle Farbe
        },
        { 
            slug: 'begriffe', 
            name: 'Jass-Begriffe',
            description: 'Von "Bock" bis "Stöck" - alle wichtigen Jass-Ausdrücke erklärt',
            icon: BookOpen,
            color: 'bg-indigo-500' // Indigo - tiefe Farbe
        },
        { 
            slug: 'varianten', 
            name: 'Jass-Varianten',
            description: 'Coiffeur, Differenzler & Co. - entdecke die Vielfalt des Jassens',
            icon: Users,
            color: 'bg-purple-500' // Lila - kreative Farbe
        },
        { 
            slug: 'jassapps', 
            name: 'Jassapps',
            description: 'Digitale Jasstafeln und Online-Jass-Apps - die besten Tools für Jasser',
            icon: Zap,
            color: 'bg-cyan-500' // Cyan - moderne Farbe
        },
        { 
            slug: 'referenzen', 
            name: 'Referenzen',
            description: 'Quellen, Literatur und Experten rund um das Jassen',
            icon: FileText,
            color: 'bg-gray-500' // Grau - neutrale Farbe
        }
    ];

    return (
        <LexikonLayout breadcrumbItems={breadcrumbItems}>
            <SeoHead
                title="Jassregeln: Alle offiziellen Jassregeln der Schweiz | Kompletter Guide 2025"
                description="Die vollständigen Jassregeln für alle Varianten: Schieber, Coiffeur & Co. Offizielles Regelwerk, Weis, Punktzählung und Taktiken verständlich erklärt."
            />

            {/* Hero Section */}
            <div className="text-center mb-8 sm:mb-12">
                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
                    Jassregeln: Das offizielle Nachschlagewerk
                </h1>
                <p className="text-lg sm:text-xl text-gray-300 leading-relaxed max-w-2xl mx-auto mb-8">
                    Alle offiziellen Jassregeln der Schweiz in einem Wiki. Von Grundlagen bis zu Profi-Strategien - hier findest du alles übers Schweizer Nationalspiel.
                </p>
                
            </div>

            {/* Main Categories Grid */}
            <div className="space-y-4 sm:space-y-6 mb-12">
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-200 text-center mb-6 sm:mb-8">
                    Was möchtest du lernen?
                </h2>
                
                <div className="grid gap-4 sm:gap-6">
                    {categories.map((category) => {
                        const IconComponent = category.icon;
                        return (
                            <Link 
                                key={category.slug}
                                href={`/wissen/${category.slug}`} 
                                className="group block"
                            >
                                <div className="bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 sm:p-8 border border-gray-700 hover:border-gray-600 hover:scale-[1.02]">
                                    <div className="flex items-start gap-4 sm:gap-6">
                                        {/* Icon */}
                                        <div className={`${category.color} rounded-xl p-3 sm:p-4 text-white flex-shrink-0 shadow-lg`}>
                                            <IconComponent className="w-6 h-6 sm:w-8 sm:h-8" />
                                        </div>
                                        
                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2 group-hover:text-green-400 transition-colors">
                                                {category.name}
                                            </h3>
                                            <p className="text-base sm:text-lg text-gray-300 leading-relaxed mb-4">
                                                {category.description}
                                            </p>
                                            <div className="flex items-center text-green-400 font-semibold">
                                                <span className="text-sm sm:text-base">Mehr erfahren</span>
                                                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 ml-1 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </div>

            {/* CTA Section for Chat */}
            <div className="bg-gradient-to-r from-green-600 to-yellow-600 rounded-xl p-6 sm:p-8 text-white text-center shadow-lg">
                <h3 className="text-xl sm:text-2xl font-bold mb-3">
                    Hast du eine spezifische Frage?
                </h3>
                <p className="text-green-100 mb-6 text-base sm:text-lg">
                    Unser KI-Jass-Experte beantwortet alle deine Fragen sofort!
                </p>
                <a 
                    href="https://chat.jassguru.ch" 
                    className="inline-flex items-center justify-center px-6 py-3 sm:px-8 sm:py-4 bg-white text-green-600 rounded-lg hover:bg-gray-100 transition-colors duration-200 font-bold text-base sm:text-lg min-h-[48px] shadow-lg"
                >
                    <Zap className="w-5 h-5 mr-2" />
                    Jetzt Jassguru fragen
                </a>
            </div>

            {/* Quick Links */}
            <div className="mt-12 pt-8 border-t border-gray-700">
                <h3 className="text-lg sm:text-xl font-bold text-gray-200 mb-4 text-center">
                    Beliebt bei Jassern
                </h3>
                <div className="flex flex-wrap justify-center gap-3">
                    <Link href="/wissen/schieber/grundlagen" className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600 hover:text-white transition-colors text-sm sm:text-base border border-gray-600">
                        Schieber lernen
                    </Link>
                    <Link href="/wissen/weis-regeln" className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600 hover:text-white transition-colors text-sm sm:text-base border border-gray-600">
                        Weis-Regeln
                    </Link>
                    <Link href="/wissen/begriffe" className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600 hover:text-white transition-colors text-sm sm:text-base border border-gray-600">
                        Jass-ABC
                    </Link>
                    <Link href="/quellen" className="px-4 py-2 bg-gray-700 text-gray-200 rounded-full hover:bg-gray-600 hover:text-white transition-colors text-sm sm:text-base border border-gray-600">
                        Quellen & Literatur
                    </Link>
                </div>
            </div>
        </LexikonLayout>
    );
};

export default WissenHomePage; 