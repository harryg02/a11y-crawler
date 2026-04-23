import { Radar, History, Settings } from 'lucide-react';
import Tab from './components/Tab';

export default function Page() {
  return (
    <div className="flex flex-col gap-3 p-4 bg-[#222222]">
      <Tab icon={<Radar size={24} />} label="Crawl & Scan" active={true} />
      <Tab icon={<History size={24} />} label="History" />
      <Tab icon={<Settings size={24} />} label="Settings" />
    </div>
    );
}