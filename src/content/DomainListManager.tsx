import React, { useState, useEffect, useRef } from 'react';
import { DomainList, storage } from '../services/storage';

interface DomainListManagerProps {
  theme: any;
  onSelectList: (listId: string | null) => void;
  selectedListId: string | null;
  sameDomain: boolean;
}

// Component for managing domain lists
const DomainListManager: React.FC<DomainListManagerProps> = ({ 
  theme, 
  onSelectList, 
  selectedListId,
  sameDomain
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [domainLists, setDomainLists] = useState<DomainList[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingList, setEditingList] = useState<Partial<DomainList>>({ name: '', domains: [] });
  // Add a direct textarea state
  const [domainsText, setDomainsText] = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync domainsText when editingList changes
  useEffect(() => {
    if (editingList.domains) {
      setDomainsText(editingList.domains.join('\n'));
    } else {
      setDomainsText('');
    }
  }, [editingList.id]); // Only update when the list ID changes
  
  // Log state changes for debugging
  useEffect(() => {
    console.log("DomainListManager state:", { isOpen, isEditing, domainLists, editingList, domainsText });
  }, [isOpen, isEditing, domainLists, editingList, domainsText]);

  // Load domain lists on mount
  useEffect(() => {
    const loadDomainLists = async () => {
      console.log("Loading domain lists...");
      try {
        const lists = await storage.getDomainLists();
        console.log("Loaded domain lists:", lists);
        setDomainLists(lists);
      } catch (error) {
        console.error("Error loading domain lists:", error);
      }
    };
    
    if (isOpen) {
      loadDomainLists();
    }
  }, [isOpen]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Don't do anything if the popover is not open
      if (!isOpen) return;
      
      const target = event.target as Node;
      
      // Get references to all the elements we need to check
      const button = buttonRef.current;
      const popover = popoverRef.current;
      
      // If button is clicked, the toggle handler will take care of it
      if (button?.contains(target)) return;
      
      // If the click is inside the popover or its children, do nothing
      if (popover?.contains(target)) {
        console.log("Click is inside popover - keeping open");
        return;
      }
      
      // If we got here, the click is outside both the button and popover
      console.log("Closing popover due to outside click");
      console.log("Target:", target);
      console.log("Target ID:", (target as Element).id || 'no id');
      console.log("Target class:", (target as Element).className || 'no class');
      setIsOpen(false);
    };

    // Add the event listener for mousedown
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Create new list or update existing one
  const saveList = async () => {
    console.log("Saving domain list:", editingList, "Text:", domainsText);
    try {
      if (!editingList.name) {
        console.warn("Cannot save list: name is empty");
        return;
      }
      
      // Process the domains text
      const domains = domainsText
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);
      
      if (domains.length === 0) {
        console.warn("Cannot save list: no valid domains");
        return;
      }
      
      // Normalize domains (remove http/https, www, trailing slashes)
      const normalizedDomains = domains.map(domain => {
        try {
          // If it's a full URL, extract the hostname
          if (domain.includes('://')) {
            return new URL(domain).hostname;
          }
          // If it's just a domain with www, remove it
          if (domain.startsWith('www.')) {
            return domain.substring(4);
          }
          return domain;
        } catch (e) {
          return domain;
        }
      })
      .filter((d, i, arr) => arr.indexOf(d) === i); // Remove duplicates
      
      console.log("Normalized domains:", normalizedDomains);
      
      if ('id' in editingList && editingList.id) {
        // Update existing list
        console.log("Updating existing list:", editingList.id);
        await storage.updateDomainList(editingList.id, {
          name: editingList.name,
          domains: normalizedDomains
        });
      } else {
        // Create new list
        console.log("Creating new list");
        await storage.saveDomainList({
          name: editingList.name || 'Untitled List',
          domains: normalizedDomains
        });
      }
      
      // Refresh lists and exit edit mode
      const lists = await storage.getDomainLists();
      console.log("Updated domain lists:", lists);
      setDomainLists(lists);
      setIsEditing(false);
      setEditingList({ name: '', domains: [] });
      setDomainsText('');
    } catch (error) {
      console.error('Error saving domain list:', error);
    }
  };

  // Delete a domain list
  const deleteList = async (id: string) => {
    console.log("Deleting domain list:", id);
    if (!confirm('Are you sure you want to delete this list?')) {
      console.log("Deletion cancelled by user");
      return;
    }
    
    try {
      await storage.deleteDomainList(id);
      console.log("List deleted successfully");
      
      // If the deleted list was selected, deselect it
      if (selectedListId === id) {
        onSelectList(null);
      }
      
      // Refresh lists
      const lists = await storage.getDomainLists();
      setDomainLists(lists);
    } catch (error) {
      console.error('Error deleting domain list:', error);
    }
  };

  // Edit an existing list
  const editList = (list: DomainList) => {
    console.log("Editing list:", list);
    setEditingList(list);
    setDomainsText(list.domains.join('\n'));
    setIsEditing(true);
  };

  // Handle name input change
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditingList({
      ...editingList,
      name: e.target.value
    });
  };

  // Handle domain input changes - directly update the text state
  const handleDomainsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDomainsText(e.target.value);
    console.log("Textarea changed to:", e.target.value);
  };
  
  // Handle key press in textarea
  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Log the key press
    console.log("Key pressed in textarea:", event.key);
  };

  // Find selected list name
  const selectedListName = selectedListId
    ? domainLists.find(list => list.id === selectedListId)?.name || 'Unknown List'
    : null;

  // Handle "Add New List" button click
  const handleAddNewList = (e: React.MouseEvent) => {
    console.log("Add New List button clicked");
    e.stopPropagation(); // Prevent event from bubbling up
    e.preventDefault(); // Prevent default behavior
    console.log("Setting isEditing to true");
    setEditingList({ name: '', domains: [] });
    setDomainsText('');
    setIsEditing(true);
  };

  // Render edit form
  const renderEditForm = () => {
    console.log("Rendering edit form with data:", editingList, "Text:", domainsText);
    return (
      <div 
        ref={formRef}
        onClick={(e) => {
          e.stopPropagation();
          console.log("Form container clicked");
        }}
        style={{
          padding: '16px',
          backgroundColor: theme.surface,
          borderRadius: '8px',
          border: `1px solid ${theme.border}`
        }}
      >
        <h3 style={{
          fontSize: '16px',
          marginBottom: '12px',
          color: theme.text
        }}>
          {editingList.id ? 'Edit List' : 'Create New List'}
        </h3>
        
        <div style={{ marginBottom: '12px' }}>
          <label 
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: theme.textSecondary
            }}
          >
            List Name
          </label>
          <input
            value={editingList.name || ''}
            onChange={handleNameChange}
            onClick={(e) => {
              e.stopPropagation();
              console.log("Input clicked");
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              console.log("Input mousedown");
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.background,
              color: theme.text
            }}
            placeholder="My Favorite Domains"
          />
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'block',
              marginBottom: '4px',
              fontSize: '14px',
              color: theme.textSecondary
            }}
          >
            Domains (one per line)
          </label>
          <textarea
            ref={textareaRef}
            value={domainsText}
            onChange={handleDomainsChange}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
              e.stopPropagation();
              console.log("Textarea clicked");
            }}
            style={{
              width: '100%',
              padding: '8px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.background,
              color: theme.text,
              minHeight: '100px',
              resize: 'vertical'
            }}
            placeholder="example.com
another-site.com
subdomain.example.org"
          />
        </div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              console.log("Cancel button clicked");
              setIsEditing(false);
              setEditingList({ name: '', domains: [] });
              setDomainsText('');
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.surface,
              color: theme.textSecondary,
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              saveList();
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: theme.primary,
              color: 'white',
              cursor: 'pointer'
            }}
          >
            Save
          </button>
        </div>
      </div>
    );
  };

  // Render list of domain lists
  const renderListSelector = () => {
    console.log("Rendering list selector with lists:", domainLists);
    return (
      <div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px'
        }}>
          <h3 style={{
            fontSize: '16px',
            color: theme.text,
            margin: 0
          }}>
            Domain Lists
          </h3>
          <button
            onClick={handleAddNewList}
            onMouseDown={(e) => {
              console.log("Add New List button mousedown");
              e.stopPropagation();
            }}
            style={{
              padding: '4px 8px',
              borderRadius: '4px',
              border: 'none',
              backgroundColor: theme.primary,
              color: 'white',
              fontSize: '12px',
              cursor: 'pointer'
            }}
          >
            + New List
          </button>
        </div>
        
        {domainLists.length === 0 ? (
          <div style={{
            padding: '12px',
            backgroundColor: theme.surface,
            borderRadius: '4px',
            textAlign: 'center',
            color: theme.textSecondary
          }}>
            No domain lists yet. Create one to get started.
          </div>
        ) : (
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '200px',
            overflowY: 'auto'
          }}>
            {domainLists.map(list => (
              <div
                key={list.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  backgroundColor: selectedListId === list.id ? theme.primary : theme.surface,
                  color: selectedListId === list.id ? 'white' : theme.text,
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                <div 
                  style={{ flexGrow: 1 }}
                  onClick={() => {
                    console.log("List item clicked:", list.id);
                    onSelectList(selectedListId === list.id ? null : list.id);
                    setIsOpen(false);
                  }}
                >
                  <div style={{ fontWeight: 500 }}>{list.name}</div>
                  <div style={{ 
                    fontSize: '12px',
                    color: selectedListId === list.id ? 'rgba(255,255,255,0.8)' : theme.textSecondary
                  }}>
                    {list.domains.length} domain{list.domains.length !== 1 ? 's' : ''}
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={(e) => {
                      console.log("Edit button clicked for list:", list.id);
                      e.stopPropagation();
                      editList(list);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: selectedListId === list.id ? 'white' : theme.textSecondary,
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px'
                    }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => {
                      console.log("Delete button clicked for list:", list.id);
                      e.stopPropagation();
                      deleteList(list.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: selectedListId === list.id ? 'white' : theme.textSecondary,
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const toggleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    console.log("Domain Lists button clicked, toggling isOpen from", isOpen, "to", !isOpen);
    setIsOpen(!isOpen);
  };

  // Close on ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        console.log("ESC key pressed, closing popover");
        setIsOpen(false);
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Focus the textarea when edit form appears
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      // Give it a slight delay to ensure React has finished rendering
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isEditing]);

  return (
    <div 
      style={{ position: 'relative' }}
      className="vibe-domain-list-manager"
    >
      <button
        ref={buttonRef}
        onClick={toggleOpen}
        onMouseDown={(e) => e.stopPropagation()}
        disabled={sameDomain}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '8px 12px',
          backgroundColor: selectedListId ? theme.primary : theme.surface,
          color: selectedListId ? 'white' : theme.textSecondary,
          border: `1px solid ${selectedListId ? theme.primary : theme.border}`,
          borderRadius: '6px',
          cursor: sameDomain ? 'not-allowed' : 'pointer',
          fontSize: '14px',
          fontWeight: '500',
          transition: 'all 0.2s ease',
          opacity: sameDomain ? 0.5 : 1,
          marginLeft: '8px'
        }}
      >
        {selectedListId ? selectedListName : 'Domain Lists'}
        <span style={{ marginLeft: '4px' }}>▾</span>
      </button>
      
      {isOpen && (
        <div
          ref={popoverRef}
          onClick={(e) => {
            e.stopPropagation();
            console.log("Popover clicked");
          }}
          onMouseDown={(e) => {
            e.stopPropagation();
            console.log("Popover mousedown");
          }}
          className="vibe-domain-list-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '50%', // Center the popover horizontally
            transform: 'translateX(-50%)', // Center the popover horizontally
            width: '320px',
            backgroundColor: theme.background,
            boxShadow: `0 4px 6px ${theme.shadow}`,
            borderRadius: '8px',
            zIndex: 10001,
            padding: '16px',
            border: `1px solid ${theme.border}`,
            maxWidth: '90vw' // Ensure it doesn't overflow the viewport width
          }}
        >
          <div style={{ position: 'relative' }}>
            {isEditing ? renderEditForm() : renderListSelector()}
            <div style={{ 
              position: 'absolute', 
              bottom: '-16px', 
              left: 0, 
              width: '100%', 
              textAlign: 'center', 
              fontSize: '10px',
              color: theme.textSecondary,
              marginTop: '8px'
            }}>
              isEditing: {isEditing ? 'true' : 'false'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DomainListManager; 