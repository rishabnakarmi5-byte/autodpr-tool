import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { Layout } from './components/Layout';
import { InputSection } from './components/InputSection';
import { HistoryList } from './components/HistoryList';
import { ReportTable } from './components/ReportTable';
import { subscribeToReports, saveReportToCloud, deleteReportFromCloud } from './services/firebaseService';
import { DailyReport, DPRItem, TabView } from './types';

const App = () => {
  const [activeTab, setActiveTab] = useState<TabView>(TabView.INPUT);
  const [reports, setReports] = useState<DailyReport[]>([]);
  
  // Current Editing State
  const [currentDate, setCurrentDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentEntries, setCurrentEntries] = useState<DPRItem[]>([]);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);

  // Sync with Firebase Realtime
  useEffect(() => {
    const unsubscribe = subscribeToReports((data) => {
      setReports(data);
    });
    return () => unsubscribe();
  }, []);

  // Handler: Select a report from history to view/edit
  const handleSelectReport = (id: string) => {
    const report = reports.find(r => r.id === id);
    if (report) {
      setCurrentReportId(report.id);
      setCurrentDate(report.date);
      setCurrentEntries(report.entries);
      setActiveTab(TabView.VIEW_REPORT);
    }
  };

  // Handler: Create a completely new report
  const handleCreateNew = () => {
    const newId = crypto.randomUUID();
    setCurrentReportId(newId);
    setCurrentEntries([]);
    setCurrentDate(new Date().toISOString().split('T')[0]);
    setActiveTab(TabView.INPUT);
  };

  // Handler: Save current state to cloud
  const saveCurrentState = async (entries: DPRItem[], date: string, reportId: string | null) => {
    const id = reportId || crypto.randomUUID();
    if (!reportId) setCurrentReportId(id);

    const report: DailyReport = {
      id,
      date,
      lastUpdated: new Date().toISOString(),
      projectTitle: "Bhotekoshi Hydroelectric Project",
      entries
    };
    
    try {
      await saveReportToCloud(report);
    } catch (e) {
      console.error("Failed to save", e);
    }
  };

  // Handler: When Gemini adds items
  const handleItemsAdded = (newItems: DPRItem[]) => {
    const updatedEntries = [...currentEntries, ...newItems];
    setCurrentEntries(updatedEntries);
    // Auto-save on adding items
    saveCurrentState(updatedEntries, currentDate, currentReportId);
    setActiveTab(TabView.VIEW_REPORT);
  };

  // Handler: Update an item in the table
  const handleUpdateItem = (id: string, field: keyof DPRItem, value: string) => {
    const updatedEntries = currentEntries.map(item => 
      item.id === id ? { ...item, [field]: value } : item
    );
    setCurrentEntries(updatedEntries);
    // Auto-save on edit
    saveCurrentState(updatedEntries, currentDate, currentReportId);
  };

  // Handler: Delete an item from the table
  const handleDeleteItem = (id: string) => {
    const updatedEntries = currentEntries.filter(item => item.id !== id);
    setCurrentEntries(updatedEntries);
    // Auto-save on delete
    saveCurrentState(updatedEntries, currentDate, currentReportId);
  };

  // Handler: Change Date
  const handleDateChange = (date: string) => {
    setCurrentDate(date);
    if (currentEntries.length > 0) {
       saveCurrentState(currentEntries, date, currentReportId);
    }
  };

  // Handler: Delete entire report
  const handleDeleteReport = async (id: string) => {
    await deleteReportFromCloud(id);
    if (currentReportId === id) {
      handleCreateNew();
    }
  };

  // Construct current report object for the View component
  const currentReport: DailyReport = {
    id: currentReportId || 'temp',
    date: currentDate,
    lastUpdated: new Date().toISOString(),
    projectTitle: "Bhotekoshi Hydroelectric Project", 
    entries: currentEntries
  };

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === TabView.INPUT && (
        <InputSection 
          currentDate={currentDate}
          onDateChange={handleDateChange}
          onItemsAdded={handleItemsAdded}
          entryCount={currentEntries.length}
        />
      )}

      {activeTab === TabView.VIEW_REPORT && (
        <ReportTable 
          report={currentReport}
          onDeleteItem={handleDeleteItem}
          onUpdateItem={handleUpdateItem}
        />
      )}

      {activeTab === TabView.HISTORY && (
        <HistoryList 
          reports={reports}
          currentReportId={currentReportId || ''}
          onSelectReport={handleSelectReport}
          onDeleteReport={handleDeleteReport}
          onCreateNew={handleCreateNew}
        />
      )}
    </Layout>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
